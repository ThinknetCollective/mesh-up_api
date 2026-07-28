import { BadRequestException } from '@nestjs/common';
import {
  CursorSpec,
  buildCursorPage,
  buildKeysetCondition,
  buildOrderBy,
  cursorScope,
  decodeCursor,
  encodeCursor,
  fetchSize,
} from './cursor.util';

/** createdAt DESC, id DESC — the comments/search style sort. */
const dateSpec: CursorSpec = {
  keys: [{ expr: 'c.createdAt', type: 'date', direction: 'DESC', nulls: 'LAST' }],
  id: { expr: 'c.id', type: 'string', direction: 'DESC' },
};

/** rank ASC NULLS LAST, createdAt DESC, id DESC — the solutions sort. */
const rankSpec: CursorSpec = {
  keys: [
    { expr: 's.rank', type: 'number', direction: 'ASC', nulls: 'LAST' },
    { expr: 's.createdAt', type: 'date', direction: 'DESC', nulls: 'LAST' },
  ],
  id: { expr: 's.id', type: 'string', direction: 'DESC' },
};

describe('cursor.util', () => {
  describe('encode / decode', () => {
    it('round-trips values, restoring declared types', () => {
      const createdAt = new Date('2026-07-20T10:15:00.000Z');
      const cursor = encodeCursor(rankSpec, {
        values: [3, createdAt],
        id: 'sol-1',
      });

      const decoded = decodeCursor(rankSpec, cursor);

      expect(decoded.values[0]).toBe(3);
      expect(decoded.values[1]).toBeInstanceOf(Date);
      expect((decoded.values[1] as Date).toISOString()).toBe(createdAt.toISOString());
      expect(decoded.id).toBe('sol-1');
    });

    it('round-trips null sort keys', () => {
      const cursor = encodeCursor(rankSpec, {
        values: [null, new Date('2026-07-20T10:15:00.000Z')],
        id: 'sol-2',
      });

      expect(decodeCursor(rankSpec, cursor).values[0]).toBeNull();
    });

    it('produces a URL-safe token', () => {
      const cursor = encodeCursor(dateSpec, {
        values: [new Date('2026-07-20T10:15:00.000Z')],
        id: 'a/b+c',
      });

      expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(encodeURIComponent(cursor)).toBe(cursor);
    });

    it('rejects malformed cursors with 400, not 500', () => {
      expect(() => decodeCursor(dateSpec, 'not-base64!!')).toThrow(BadRequestException);
      expect(() =>
        decodeCursor(dateSpec, Buffer.from('{"nope":1}').toString('base64url')),
      ).toThrow(BadRequestException);
    });

    it('rejects a cursor whose key count no longer matches the spec', () => {
      const cursor = encodeCursor(dateSpec, {
        values: [new Date()],
        id: 'x',
      });

      expect(() => decodeCursor(rankSpec, cursor)).toThrow(BadRequestException);
    });

    it('rejects a cursor minted under different query filters', () => {
      const specA: CursorSpec = { ...dateSpec, scope: cursorScope({ q: 'traffic' }) };
      const specB: CursorSpec = { ...dateSpec, scope: cursorScope({ q: 'water' }) };

      const cursor = encodeCursor(specA, { values: [new Date()], id: 'x' });

      expect(() => decodeCursor(specB, cursor)).toThrow(BadRequestException);
      expect(() => decodeCursor(specA, cursor)).not.toThrow();
    });
  });

  describe('cursorScope', () => {
    it('is independent of key order and of undefined/null entries', () => {
      expect(cursorScope({ q: 'a', category: 'b' })).toBe(
        cursorScope({ category: 'b', q: 'a' }),
      );
      expect(cursorScope({ q: 'a' })).toBe(cursorScope({ q: 'a', tags: undefined }));
    });

    it('differs when a filter value differs', () => {
      expect(cursorScope({ q: 'a' })).not.toBe(cursorScope({ q: 'b' }));
    });
  });

  describe('buildOrderBy', () => {
    it('appends the id tiebreaker and makes NULL placement explicit', () => {
      expect(buildOrderBy(rankSpec)).toEqual([
        { expr: 's.rank', direction: 'ASC', nulls: 'NULLS LAST' },
        { expr: 's.createdAt', direction: 'DESC', nulls: 'NULLS LAST' },
        { expr: 's.id', direction: 'DESC', nulls: 'NULLS LAST' },
      ]);
    });

    it('falls back to Postgres NULL defaults when unspecified', () => {
      const spec: CursorSpec = {
        keys: [{ expr: 'n.score', type: 'number', direction: 'DESC' }],
        id: { expr: 'n.id', type: 'number', direction: 'ASC' },
      };

      expect(buildOrderBy(spec)[0].nulls).toBe('NULLS FIRST');
    });
  });

  describe('buildKeysetCondition', () => {
    it('builds a lexicographic OR-chain ending in the id tiebreaker', () => {
      const createdAt = new Date('2026-07-20T10:15:00.000Z');
      const cursor = decodeCursor(
        dateSpec,
        encodeCursor(dateSpec, { values: [createdAt], id: 'c-9' }),
      );

      const { sql, params } = buildKeysetCondition(dateSpec, cursor);

      expect(sql).toBe(
        '((c.createdAt < :cursor_0 OR c.createdAt IS NULL) OR ' +
          '(c.createdAt = :cursor_eq_0 AND c.id < :cursor_1))',
      );
      expect(params.cursor_0).toEqual(createdAt);
      expect(params.cursor_eq_0).toEqual(createdAt);
      expect(params.cursor_1).toBe('c-9');
    });

    it('uses > for ASC keys and < for DESC keys', () => {
      const cursor = decodeCursor(
        rankSpec,
        encodeCursor(rankSpec, {
          values: [2, new Date('2026-07-20T10:15:00.000Z')],
          id: 's-1',
        }),
      );

      const { sql } = buildKeysetCondition(rankSpec, cursor);

      expect(sql).toContain('s.rank > :cursor_0');
      expect(sql).toContain('s.createdAt < :cursor_1');
    });

    it('matches NULL cursor values with IS NULL, never with =', () => {
      const cursor = decodeCursor(
        rankSpec,
        encodeCursor(rankSpec, {
          values: [null, new Date('2026-07-20T10:15:00.000Z')],
          id: 's-1',
        }),
      );

      const { sql, params } = buildKeysetCondition(rankSpec, cursor);

      expect(sql).toContain('s.rank IS NULL AND');
      expect(params.cursor_eq_0).toBeUndefined();
    });

    it('drops the level entirely for a NULL value sorting NULLS LAST', () => {
      // Nothing sorts after a NULL when NULLs are last, so there must be no
      // standalone `s.rank ...` comparison group — only the deeper tiebreakers.
      const cursor = decodeCursor(
        rankSpec,
        encodeCursor(rankSpec, {
          values: [null, new Date('2026-07-20T10:15:00.000Z')],
          id: 's-1',
        }),
      );

      const { sql } = buildKeysetCondition(rankSpec, cursor);

      expect(sql).not.toContain('s.rank <');
      expect(sql).not.toContain('s.rank >');
      expect(sql).not.toContain('s.rank IS NOT NULL');
    });

    it('treats non-NULL rows as "after" a NULL when NULLs sort first', () => {
      const spec: CursorSpec = {
        keys: [{ expr: 's.rank', type: 'number', direction: 'DESC', nulls: 'FIRST' }],
        id: { expr: 's.id', type: 'string', direction: 'DESC' },
      };
      const cursor = decodeCursor(
        spec,
        encodeCursor(spec, { values: [null], id: 's-1' }),
      );

      expect(buildKeysetCondition(spec, cursor).sql).toContain('s.rank IS NOT NULL');
    });

    it('supports computed expressions so ranked sorts can be recomputed in WHERE', () => {
      const rankExpr =
        "ts_rank(to_tsvector('english', node.title), plainto_tsquery('english', :q))";
      const spec: CursorSpec = {
        keys: [{ expr: rankExpr, type: 'number', direction: 'DESC', nulls: 'LAST' }],
        id: { expr: 'node.id', type: 'number', direction: 'DESC' },
      };
      const cursor = decodeCursor(
        spec,
        encodeCursor(spec, { values: [0.75], id: 42 }),
      );

      const { sql, params } = buildKeysetCondition(spec, cursor);

      // The expression is re-evaluated per row; only the value is a constant.
      expect(sql).toContain(`${rankExpr} < :cursor_0`);
      expect(params.cursor_0).toBe(0.75);
      // The caller's own :q binding must not be shadowed.
      expect(params).not.toHaveProperty('q');
    });

    it('omits the dead IS NULL branch on the non-nullable id tiebreaker', () => {
      const cursor = { values: [], id: 'zzz' };
      const spec: CursorSpec = {
        keys: [],
        id: { expr: 's.id', type: 'string', direction: 'ASC' },
      };

      expect(buildKeysetCondition(spec, cursor).sql).toBe('(s.id > :cursor_0)');
    });

    it('keeps the predicate satisfiable even when every sort key is NULL', () => {
      // The id tiebreaker is non-null and unique, so there is always a level
      // that can still advance — the degenerate `1 = 0` is unreachable via a
      // decoded cursor.
      const cursor = decodeCursor(
        rankSpec,
        encodeCursor(rankSpec, { values: [null, null], id: 's-1' }),
      );

      expect(buildKeysetCondition(rankSpec, cursor).sql).toBe(
        '(s.rank IS NULL AND s.createdAt IS NULL AND s.id < :cursor_2)',
      );
    });
  });

  describe('buildCursorPage', () => {
    const spec = dateSpec;
    const rows = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `c-${i}`,
        createdAt: new Date(2026, 6, 20, 10, i),
      }));
    const positionOf = (row: { id: string; createdAt: Date }) => ({
      values: [row.createdAt],
      id: row.id,
    });

    it('over-fetches by exactly one', () => {
      expect(fetchSize(20)).toBe(21);
    });

    it('trims the sentinel row and reports hasMore', () => {
      const page = buildCursorPage(rows(fetchSize(3)), 3, spec, positionOf);

      expect(page.items).toHaveLength(3);
      expect(page.items.map((r) => r.id)).toEqual(['c-0', 'c-1', 'c-2']);
      expect(page.hasMore).toBe(true);
      expect(page.nextCursor).not.toBeNull();
    });

    it('mints the cursor from the last returned row, not the sentinel', () => {
      const all = rows(fetchSize(3));
      const page = buildCursorPage(all, 3, spec, positionOf);

      expect(decodeCursor(spec, page.nextCursor!).id).toBe('c-2');
    });

    it('reports the end of the list with a null cursor', () => {
      const page = buildCursorPage(rows(2), 3, spec, positionOf);

      expect(page.items).toHaveLength(2);
      expect(page.hasMore).toBe(false);
      expect(page.nextCursor).toBeNull();
    });

    it('handles an exactly-full final page', () => {
      const page = buildCursorPage(rows(3), 3, spec, positionOf);

      expect(page.hasMore).toBe(false);
      expect(page.nextCursor).toBeNull();
    });

    it('handles an empty result set', () => {
      const page = buildCursorPage([], 3, spec, positionOf);

      expect(page).toEqual({ items: [], nextCursor: null, hasMore: false });
    });
  });
});
