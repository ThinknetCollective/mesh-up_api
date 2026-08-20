# API Changelog

Notable changes to the public HTTP API. Breaking changes and deprecations are
called out with a migration path.

---

## Unreleased

### Added

- **`GET /v1/solutions`** — new endpoint returning a cursor-paginated list of
  visible solutions, best-ranked first. Solutions hidden by moderation
  (`status = "hidden"`) are never returned.

### Changed

- **Cursor-based pagination on all list endpoints.** `GET /v1/search`,
  `GET /api/v1/solutions/{id}/comments` and the new `GET /v1/solutions` now
  return a uniform envelope:

  ```json
  {
    "items": [ /* ... */ ],
    "nextCursor": "eyJwIjoxLCJ2IjpbMiwiMjAyNi0wNy0yMFQxMDowMTowMC4wMDBaIl0sImkiOiJiOWY3ZDNjMi0xYThlLTRmNjAtOWMyNS03ZDRhM2UxYjhmMDkiLCJzIjoiMDRlYTJiNGQ4Y2M3In0",
    "hasMore": true
  }
  ```

  Offset pagination re-counts rows on every request, so a row inserted between
  two page fetches shifted every later row by one — clients saw items twice or
  missed them entirely. Keyset pagination remembers where the previous page
  ended and asks for rows strictly after that point, which is unaffected by
  writes elsewhere in the table.

  Dropping the `COUNT(*)` that backed `meta.total` is also what keeps these
  endpoints from degrading as the tables grow.

### Deprecated

- **`page` query parameter** on `GET /v1/search` and
  `GET /api/v1/solutions/{id}/comments`.

  The parameter is **still accepted and still validated**, but has **no
  effect** — these endpoints are cursor-only. It is retained so existing
  clients continue to receive `200` rather than a validation error while they
  migrate. It will be removed in a future release; see the migration note
  below.

  `GET /v1/solutions` is new and never accepted `page`, so it rejects it.

### Removed

- **`meta` object** from `GET /v1/search` responses (`total`, `page`, `limit`,
  `totalPages`), and **`total` / `page` / `limit`** from
  `GET /api/v1/solutions/{id}/comments`. There is no cursor equivalent of
  `total` or `totalPages`: computing them requires the per-request `COUNT(*)`
  this change exists to eliminate.

- **`data` key**, renamed to `items` for consistency across every list
  endpoint.

---

## Migration note: offset → cursor

### What changes in the response

| Before (offset) | After (cursor) |
| --- | --- |
| `data` | `items` |
| `meta.total`, `meta.totalPages` | *(no equivalent — see below)* |
| `meta.page`, `meta.limit` | `nextCursor`, `hasMore` |

For comments the old shape was flat (`{ data, total, page, limit }`); for
search it was nested under `meta`. Both now return the same envelope.

### What changes in the request

| Before | After |
| --- | --- |
| `?page=1&limit=20` | `?limit=20` |
| `?page=2&limit=20` | `?cursor=<nextCursor from page 1>&limit=20` |

`limit` is unchanged: optional, defaults to 20, capped at 100.

### Iterating every page

```js
let cursor;
do {
  const params = new URLSearchParams({ limit: '50' });
  if (cursor) params.set('cursor', cursor);

  const page = await fetch(`/v1/search?q=traffic&${params}`).then((r) => r.json());

  for (const item of page.items) {
    // ...
  }

  cursor = page.nextCursor;
} while (cursor);
```

Stop on `hasMore === false` (equivalently, `nextCursor === null`). Do not
assume a short page means the end — a page can be full and still have more.

### Rules for `cursor`

- **Opaque.** Do not parse, construct, or modify it. Its encoding is versioned
  and will change without notice.
- **Tied to its query.** A cursor embeds a fingerprint of the filters that
  produced it. Reusing a cursor from `?q=traffic` on `?q=water` returns
  `400 VALIDATION_FAILED`, because its stored sort key describes a different
  ordering. Changing any filter means restarting from the first page.
- **Not a bookmark.** Cursors are positions in a sort order, not stable
  references to a row. Persisting one across a deploy may return
  `400 VALIDATION_FAILED` if the cursor format has since been revised; treat
  that as "restart pagination", not as an error to surface to users.

### Replacing `total` / `totalPages`

There is no drop-in replacement. Options, in rough order of preference:

1. **Use `hasMore` for "load more" affordances.** This covers most UI needs and
   is what the endpoints are optimised for.
2. **Show an approximate count** from a separately cached aggregate, if a count
   is genuinely required for display.
3. **Numbered page controls are not supported.** They require an offset, which
   is what produces the duplicate/skipped rows this change eliminates. Prefer
   infinite scroll or an explicit "next" control.

### Known behaviour: rows that move

Cursor pagination guarantees no duplicates and no skipped rows *for rows whose
sort key does not change mid-iteration*. On `GET /v1/solutions`, `rank` is
mutable via `PATCH /v1/solutions/{id}/rank`. A solution re-ranked to a position
the reader has already passed will not appear in the remainder of that
iteration. This is inherent to keyset pagination, not a defect — rows that stay
put are still never duplicated or dropped.

### Sort order per endpoint

| Endpoint | Order |
| --- | --- |
| `GET /v1/solutions` | `rank` ascending (1 is best, unranked last), then newest first, then id |
| `GET /api/v1/solutions/{id}/comments` | oldest first, then id — unchanged from the offset implementation |
| `GET /v1/search` with `q` | relevance descending, then newest first, then id |
| `GET /v1/search` without `q` | newest first, then id |

Only root comments (`depth = 0`) are paginated; replies always travel nested
inside their root comment, so a new reply cannot shift the pagination.
