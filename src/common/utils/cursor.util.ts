import { createHash } from 'crypto';
import { BadRequestException } from '@nestjs/common';
import { CursorPaginatedResponse } from '../interfaces/cursor-paginated-response.interface';

/**
 * Keyset ("seek") pagination helpers.
 *
 * Offset pagination re-counts rows on every request, so an insert between two
 * page fetches shifts every later row by one — the client sees an item twice or
 * misses it entirely. Keyset pagination instead remembers *where the last page
 * ended* (its sort key + id) and asks for rows strictly after that point, which
 * is unaffected by inserts elsewhere in the table.
 *
 * The cursor stores the sort key **values**, never a row offset. The sort key
 * itself is re-evaluated per row by the SQL expression in the {@link CursorKey},
 * which is what makes this work for computed sorts such as `ts_rank(...)`: the
 * WHERE clause recomputes the rank for each candidate row and compares it
 * against the constant carried in the cursor.
 */

/** Cursor payload format version. Bumped if the encoding changes shape. */
const CURSOR_VERSION = 1;

export type CursorValue = string | number | boolean | Date | null;

/** How a key's value is rehydrated when a cursor is decoded. */
export type CursorKeyType = 'string' | 'number' | 'date' | 'boolean';

export type SortDirection = 'ASC' | 'DESC';

export type NullsPosition = 'FIRST' | 'LAST';

export interface CursorKey {
  /**
   * Raw SQL used both to ORDER BY and to compare against the cursor value.
   *
   * May be a plain column reference (`'node.createdAt'`) or a full expression
   * (`"ts_rank(to_tsvector(...), plainto_tsquery('english', :q))"`). It must be
   * an expression, not a SELECT alias — Postgres allows output aliases in
   * ORDER BY but not in WHERE, and this string is used in both.
   *
   * Any bind params referenced here (`:q`) must already be set on the query
   * builder by the caller.
   */
  expr: string;

  /** Rehydration type for the value carried in the cursor. */
  type: CursorKeyType;

  direction: SortDirection;

  /**
   * Where NULLs sort. Always emitted explicitly so the ORDER BY and the WHERE
   * agree. Defaults to Postgres' own behaviour: ASC → LAST, DESC → FIRST.
   */
  nulls?: NullsPosition;

  /**
   * Set when the expression can never be NULL (a primary key, a NOT NULL
   * column). Suppresses the `OR expr IS NULL` branches, which are dead weight
   * and can discourage the planner from using a plain btree index.
   */
  nonNullable?: boolean;
}

export interface CursorSpec {
  /** Sort keys, most significant first. Must not include the id tiebreaker. */
  keys: CursorKey[];

  /**
   * Unique, non-nullable tiebreaker appended after `keys`. Without it the sort
   * is not a total order and rows with equal keys can be duplicated or skipped
   * across page boundaries.
   */
  id: {
    expr: string;
    type: Extract<CursorKeyType, 'string' | 'number'>;
    direction: SortDirection;
  };

  /**
   * Fingerprint of the query this cursor belongs to (filters, search term,
   * sort mode). A cursor is only meaningful for the query that produced it —
   * replaying one against different filters would compare against a value from
   * a different ordering. Build it with {@link cursorScope}.
   */
  scope?: string;
}

interface CursorPayload {
  /** Format version. */
  p: number;
  /** Sort key values, aligned with `spec.keys`. */
  v: unknown[];
  /** Id of the last row on the page. */
  i: string | number;
  /** Query scope fingerprint, when the spec declares one. */
  s?: string;
}

export interface DecodedCursor {
  values: CursorValue[];
  id: string | number;
}

// -----------------------------------------------------------------------------
// Scope
// -----------------------------------------------------------------------------

/**
 * Stable short fingerprint of the query params a cursor is tied to.
 *
 * Key order in the input does not affect the result. Undefined values are
 * dropped so `{ q: 'x' }` and `{ q: 'x', category: undefined }` agree.
 */
export function cursorScope(params: Record<string, unknown>): string {
  const normalized = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null)
    .sort()
    .map((key) => [key, params[key]]);

  return createHash('sha1')
    .update(JSON.stringify(normalized))
    .digest('hex')
    .slice(0, 12);
}

// -----------------------------------------------------------------------------
// Encode / decode
// -----------------------------------------------------------------------------

/** Encode the position of the last row on a page into an opaque token. */
export function encodeCursor(
  spec: CursorSpec,
  position: { values: CursorValue[]; id: string | number },
): string {
  if (position.values.length !== spec.keys.length) {
    throw new Error(
      `Cursor expects ${spec.keys.length} sort key value(s), received ${position.values.length}`,
    );
  }

  const payload: CursorPayload = {
    p: CURSOR_VERSION,
    v: position.values.map((value) =>
      value instanceof Date ? value.toISOString() : value,
    ),
    i: position.id,
  };
  if (spec.scope) payload.s = spec.scope;

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

/**
 * Decode a client-supplied cursor.
 *
 * Throws BadRequestException — never a 500 — for anything a client could send:
 * corrupt base64, wrong shape, stale format version, or a cursor minted under
 * a different set of filters.
 */
export function decodeCursor(spec: CursorSpec, cursor: string): DecodedCursor {
  let payload: CursorPayload;
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid cursor');
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray(payload.v) ||
    payload.i === undefined ||
    payload.i === null
  ) {
    throw new BadRequestException('Invalid cursor');
  }

  if (payload.p !== CURSOR_VERSION) {
    throw new BadRequestException(
      'Cursor format is no longer supported — restart pagination from the first page',
    );
  }

  if (payload.v.length !== spec.keys.length) {
    throw new BadRequestException('Invalid cursor');
  }

  if (spec.scope && payload.s !== spec.scope) {
    throw new BadRequestException(
      'Cursor does not match the current query filters — restart pagination from the first page',
    );
  }

  return {
    values: payload.v.map((value, i) => coerce(value, spec.keys[i].type)),
    id: coerce(payload.i, spec.id.type) as string | number,
  };
}

function coerce(value: unknown, type: CursorKeyType): CursorValue {
  if (value === null || value === undefined) return null;

  switch (type) {
    case 'number': {
      const num = Number(value);
      if (Number.isNaN(num)) throw new BadRequestException('Invalid cursor');
      return num;
    }
    case 'date': {
      const date = new Date(value as string);
      if (Number.isNaN(date.getTime())) {
        throw new BadRequestException('Invalid cursor');
      }
      return date;
    }
    case 'boolean':
      return Boolean(value);
    default:
      return String(value);
  }
}

// -----------------------------------------------------------------------------
// SQL generation
// -----------------------------------------------------------------------------

/** ORDER BY fragments for a spec, in order. Feed to `orderBy`/`addOrderBy`. */
export function buildOrderBy(
  spec: CursorSpec,
): Array<{ expr: string; direction: SortDirection; nulls: 'NULLS FIRST' | 'NULLS LAST' }> {
  return allKeys(spec).map((key) => ({
    expr: key.expr,
    direction: key.direction,
    nulls: nullsOf(key) === 'FIRST' ? 'NULLS FIRST' : 'NULLS LAST',
  }));
}

/**
 * WHERE fragment selecting rows that sort strictly after the cursor position.
 *
 * Emits the expanded lexicographic form rather than Postgres row-value syntax
 * (`(a, b) < (:a, :b)`), because row-values cannot express mixed sort
 * directions or explicit NULLS placement:
 *
 * ```
 * (A < :a) OR (A = :a AND B < :b) OR (A = :a AND B = :b AND id < :id)
 * ```
 *
 * The returned params are prefixed to avoid colliding with params the caller
 * has already bound (e.g. `:q` in the search query).
 */
export function buildKeysetCondition(
  spec: CursorSpec,
  cursor: DecodedCursor,
  paramPrefix = 'cursor',
): { sql: string; params: Record<string, unknown> } {
  const keys = allKeys(spec);
  const values: CursorValue[] = [...cursor.values, cursor.id];
  const params: Record<string, unknown> = {};
  const groups: string[] = [];

  for (let i = 0; i < keys.length; i++) {
    const after = strictlyAfter(keys[i], values[i], `${paramPrefix}_${i}`, params);

    // No row can sort after this value at this level (e.g. NULL with NULLS
    // LAST) — the whole OR-group is empty, so skip it.
    if (after === null) continue;

    const conditions: string[] = [];
    for (let j = 0; j < i; j++) {
      conditions.push(equals(keys[j], values[j], `${paramPrefix}_eq_${j}`, params));
    }
    conditions.push(after);

    groups.push(wrap(conditions.join(' AND ')));
  }

  // Every level was empty: the cursor points at the very last row.
  if (groups.length === 0) return { sql: '1 = 0', params: {} };

  return { sql: wrap(groups.join(' OR ')), params };
}

/**
 * Parenthesise, unless the string is already wrapped as a whole. Keeps the
 * generated SQL readable in logs instead of accreting `(((...)))`.
 */
function wrap(sql: string): string {
  if (!sql.startsWith('(') || !sql.endsWith(')')) return `(${sql})`;

  // Confirm the leading paren is closed by the trailing one, and not by some
  // earlier one (e.g. `(a) OR (b)`, which does need wrapping).
  let depth = 0;
  for (let i = 0; i < sql.length; i++) {
    if (sql[i] === '(') depth++;
    else if (sql[i] === ')') {
      depth--;
      if (depth === 0) return i === sql.length - 1 ? sql : `(${sql})`;
    }
  }
  return `(${sql})`;
}

/**
 * Equality for the "same prefix" part of the lexicographic comparison.
 * `expr = :param` yields NULL (not true) when either side is NULL, so a NULL
 * cursor value has to be matched with IS NULL.
 */
function equals(
  key: CursorKey,
  value: CursorValue,
  paramName: string,
  params: Record<string, unknown>,
): string {
  if (value === null) return `${key.expr} IS NULL`;
  params[paramName] = value;
  return `${key.expr} = :${paramName}`;
}

/** Whether this key needs the `OR expr IS NULL` branch at all. */
function nullable(key: CursorKey): boolean {
  return !key.nonNullable;
}

/**
 * Rows sorting strictly after `value` for this key. Returns null when that set
 * is provably empty.
 */
function strictlyAfter(
  key: CursorKey,
  value: CursorValue,
  paramName: string,
  params: Record<string, unknown>,
): string | null {
  const nulls = nullsOf(key);

  if (value === null) {
    // NULLs sort last: nothing follows them. NULLs sort first: every non-NULL
    // row follows.
    return nulls === 'LAST' ? null : `${key.expr} IS NOT NULL`;
  }

  const operator = key.direction === 'DESC' ? '<' : '>';
  params[paramName] = value;
  const comparison = `${key.expr} ${operator} :${paramName}`;

  // With NULLS LAST the NULL rows come after every non-NULL value, so they are
  // part of "strictly after" too.
  return nulls === 'LAST' && nullable(key)
    ? `(${comparison} OR ${key.expr} IS NULL)`
    : comparison;
}

/** Postgres defaults: ASC → NULLS LAST, DESC → NULLS FIRST. */
function nullsOf(key: CursorKey): NullsPosition {
  return key.nulls ?? (key.direction === 'DESC' ? 'FIRST' : 'LAST');
}

function allKeys(spec: CursorSpec): CursorKey[] {
  return [
    ...spec.keys,
    { ...spec.id, nulls: 'LAST' as NullsPosition, nonNullable: true },
  ];
}

// -----------------------------------------------------------------------------
// Page assembly
// -----------------------------------------------------------------------------

/**
 * How many rows to request in order to answer `hasMore` without a COUNT query:
 * fetch one extra and check whether it came back.
 */
export function fetchSize(limit: number): number {
  return limit + 1;
}

/**
 * Turn an over-fetched row set (see {@link fetchSize}) into the shared response
 * envelope, minting the cursor from the last row that is actually returned.
 */
export function buildCursorPage<T>(
  rows: T[],
  limit: number,
  spec: CursorSpec,
  positionOf: (row: T) => { values: CursorValue[]; id: string | number },
): CursorPaginatedResponse<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];

  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(spec, positionOf(last)) : null,
    hasMore,
  };
}
