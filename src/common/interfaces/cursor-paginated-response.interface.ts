/**
 * Canonical response envelope for every cursor-paginated list endpoint.
 *
 * `nextCursor` is an opaque, URL-safe token. Clients must treat it as a black
 * box: pass it back verbatim as `?cursor=` to fetch the following page, and
 * stop when `hasMore` is false (at which point `nextCursor` is always null).
 */
export interface CursorPaginatedResponse<T> {
  /** The page of results, in sort order. */
  items: T[];

  /** Token for the next page, or null when this is the last page. */
  nextCursor: string | null;

  /** Whether at least one more item exists after this page. */
  hasMore: boolean;
}
