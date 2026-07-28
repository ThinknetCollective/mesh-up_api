import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MeshNode } from '../mesh-nodes/entities/mesh-node.entity';
import { SearchQueryDto } from './dto/search.dto';
import { DEFAULT_PAGE_SIZE } from '../common/dto/cursor-pagination-query.dto';
import { CursorPaginatedResponse } from '../common/interfaces/cursor-paginated-response.interface';
import {
  CursorSpec,
  buildCursorPage,
  buildKeysetCondition,
  buildOrderBy,
  cursorScope,
  decodeCursor,
  fetchSize,
} from '../common/utils/cursor.util';

/**
 * Relevance expression, used verbatim in SELECT, ORDER BY *and* the cursor's
 * WHERE clause. It is deliberately the full expression rather than the `rank`
 * output alias: Postgres accepts an output alias in ORDER BY but rejects it in
 * WHERE, and keyset pagination has to re-evaluate the ranking per candidate row.
 *
 * The `::double precision` cast matters. `ts_rank` returns float4, whereas a
 * cursor value round-trips through JSON as a float64. Widening both sides (an
 * exact conversion from float4) keeps the `expr = :value` tie-break branch
 * comparing equal instead of failing on a representation mismatch. Spelled in
 * full rather than as `::float8` — the two are identical to Postgres, and the
 * long form is what the in-memory engine used by the integration tests parses.
 */
const RANK_EXPR =
  `ts_rank(` +
  `to_tsvector('english', node.title || ' ' || node.description), ` +
  `plainto_tsquery('english', :q)` +
  `)::double precision`;

/** Matching predicate for the full-text filter. */
const MATCH_EXPR =
  `to_tsvector('english', node.title || ' ' || node.description) ` +
  `@@ plainto_tsquery('english', :q)`;

/** A search hit: the node plus its relevance, null when not a ranked search. */
export type SearchResult = MeshNode & { relevanceScore: number | null };

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(MeshNode)
    private readonly meshNodeRepository: Repository<MeshNode>,
  ) {}

  /**
   * Cursor ordering. With a search term the primary key is the dynamically
   * computed relevance; without one it is recency. `createdAt` breaks relevance
   * ties (ts_rank collides often across a corpus) and the node id makes the
   * ordering total.
   */
  private cursorSpec(query: SearchQueryDto): CursorSpec {
    const { q, type, category, tags, dateFrom, dateTo } = query;

    const createdAtKey = {
      expr: 'node.createdAt',
      type: 'date' as const,
      direction: 'DESC' as const,
      nulls: 'LAST' as const,
      nonNullable: true,
    };

    return {
      keys: q
        ? [
            {
              expr: RANK_EXPR,
              type: 'number' as const,
              direction: 'DESC' as const,
              nulls: 'LAST' as const,
            },
            createdAtKey,
          ]
        : [createdAtKey],
      id: { expr: 'node.id', type: 'number', direction: 'DESC' },
      // A cursor is only valid for the exact query that produced it: its stored
      // relevance value is meaningless under a different term or filter set.
      scope: cursorScope({ q, type, category, tags, dateFrom, dateTo }),
    };
  }

  async search(query: SearchQueryDto): Promise<CursorPaginatedResponse<SearchResult>> {
    const { q, category, tags, dateFrom, dateTo } = query;
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const spec = this.cursorSpec(query);

    const qb = this.meshNodeRepository
      .createQueryBuilder('node')
      .select([
        'node.id',
        'node.title',
        'node.description',
        'node.authorId',
        'node.createdAt',
        'node.updatedAt',
      ]);

    if (q) {
      // `:q` must be bound before the cursor predicate is appended, since
      // RANK_EXPR references it.
      qb.addSelect(RANK_EXPR, 'rank').where(MATCH_EXPR, { q });
    }

    if (category) {
      qb.andWhere('node.category = :category', { category });
    }

    if (tags) {
      qb.andWhere(':tag = ANY(node.tags)', { tag: tags });
    }

    if (dateFrom) {
      qb.andWhere('node.createdAt >= :dateFrom', { dateFrom });
    }

    if (dateTo) {
      qb.andWhere('node.createdAt <= :dateTo', { dateTo });
    }

    if (query.cursor) {
      const { sql, params } = buildKeysetCondition(
        spec,
        decodeCursor(spec, query.cursor),
      );
      qb.andWhere(sql, params);
    }

    buildOrderBy(spec).forEach((order, i) => {
      const apply = i === 0 ? qb.orderBy.bind(qb) : qb.addOrderBy.bind(qb);
      apply(order.expr, order.direction, order.nulls);
    });

    // Over-fetch by one instead of running a second COUNT query: on a ranked
    // full-text search the count is the expensive half of the request.
    const results = await qb.limit(fetchSize(limit)).getRawAndEntities();

    const rows: SearchResult[] = results.entities.map((entity, i) => ({
      ...entity,
      relevanceScore:
        results.raw[i]?.rank !== undefined && results.raw[i]?.rank !== null
          ? Number(results.raw[i].rank)
          : null,
    }));

    return buildCursorPage(rows, limit, spec, (row) => ({
      values: q
        ? [row.relevanceScore, row.createdAt]
        : [row.createdAt],
      id: row.id,
    }));
  }
}
