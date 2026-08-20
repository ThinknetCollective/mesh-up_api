import { DataSource } from 'typeorm';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search.dto';
import { MeshNode } from '../mesh-nodes/entities/mesh-node.entity';
import { Category } from '../category/entities/category.entity';
import { createInMemoryDataSource } from '../common/testing/in-memory-db';

/**
 * Acceptance criterion for GET /v1/search:
 * "no duplicate or skipped items when items are inserted between page fetches".
 *
 * Runs against pg-mem with stubbed full-text functions (see in-memory-db.ts).
 * The stubs are NOT Postgres' ranking algorithm — what is under test is that a
 * cursor whose sort key is an *expression recomputed per row* still paginates
 * without duplicating or dropping rows. The equivalent test against a real
 * `ts_rank` lives in search.pagination.postgres.spec.ts.
 */

const BASE_TIME = Date.UTC(2026, 6, 20, 10, 0, 0);

describe('GET /v1/search — cursor stability under concurrent inserts', () => {
  let dataSource: DataSource;
  let service: SearchService;
  let seq: number;

  beforeEach(async () => {
    dataSource = await createInMemoryDataSource({
      entities: [MeshNode, Category],
      fullText: true,
    });
    service = new SearchService(dataSource.getRepository(MeshNode));
    seq = 0;
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  /**
   * Insert a node. `traffic` controls how many times the search term appears,
   * and therefore the stubbed relevance — higher means it sorts earlier under
   * a ranked search.
   */
  async function addNode(opts: {
    traffic: number;
    minutesFromBase?: number;
  }): Promise<MeshNode> {
    const repo = dataSource.getRepository(MeshNode);
    const filler = Array(opts.traffic).fill('traffic').join(' ');
    const node = repo.create({
      title: `node ${seq}`,
      description: `${filler} lorem ipsum`.trim(),
      authorId: 'author-1',
      createdAt: new Date(BASE_TIME + (opts.minutesFromBase ?? seq) * 60_000),
    });
    seq++;
    return repo.save(node);
  }

  /** Walk every page, running `between` after each fetch. */
  async function paginate(
    query: SearchQueryDto,
    limit: number,
    between?: (pageIndex: number) => Promise<void>,
  ): Promise<number[]> {
    const seen: number[] = [];
    let cursor: string | undefined;
    let pageIndex = 0;

    for (let guard = 0; guard < 50; guard++) {
      const page = await service.search({ ...query, cursor, limit });
      seen.push(...page.items.map((n) => n.id));

      if (!page.hasMore) return seen;

      cursor = page.nextCursor!;
      if (between) await between(pageIndex);
      pageIndex++;
    }

    throw new Error('pagination did not terminate');
  }

  async function seed(count: number): Promise<number[]> {
    const ids: number[] = [];
    for (let i = 0; i < count; i++) {
      // Cycle relevance 1..3 so many nodes share a rank and the tiebreakers
      // actually have to do work.
      ids.push((await addNode({ traffic: (i % 3) + 1 })).id);
    }
    return ids;
  }

  describe('ranked search (sort key is a computed ts_rank expression)', () => {
    it('returns every node exactly once when nothing changes', async () => {
      const seeded = await seed(10);

      const seen = await paginate({ q: 'traffic' }, 3);

      expect(seen.slice().sort((a, b) => a - b)).toEqual(seeded.slice().sort((a, b) => a - b));
    });

    it('skips and duplicates nothing when a highly relevant node is inserted between pages', async () => {
      // Under DESC-by-relevance this lands at the very front — the position
      // that shifts every later row under OFFSET pagination.
      const seeded = await seed(10);

      const seen = await paginate({ q: 'traffic' }, 3, async (page) => {
        if (page === 0) await addNode({ traffic: 9 });
      });

      expect(new Set(seen).size).toBe(seen.length);
      expect(seen).toEqual(expect.arrayContaining(seeded));
    });

    it('survives a high-relevance insert before every page boundary', async () => {
      const seeded = await seed(12);

      const seen = await paginate({ q: 'traffic' }, 3, async () => {
        await addNode({ traffic: 9 });
      });

      expect(new Set(seen).size).toBe(seen.length);
      expect(seen).toEqual(expect.arrayContaining(seeded));
    });

    it('keeps nodes sharing an identical relevance stable across a page boundary', async () => {
      // Every node ranks the same, so ordering rests entirely on the
      // createdAt + id tiebreakers.
      const ids: number[] = [];
      for (let i = 0; i < 9; i++) ids.push((await addNode({ traffic: 2 })).id);

      const seen = await paginate({ q: 'traffic' }, 3);

      expect(new Set(seen).size).toBe(9);
      expect(seen.slice().sort((a, b) => a - b)).toEqual(ids.slice().sort((a, b) => a - b));
    });

    it('excludes non-matching nodes from a ranked search', async () => {
      await seed(4);
      const irrelevant = await addNode({ traffic: 0 });

      const seen = await paginate({ q: 'traffic' }, 3);

      expect(seen).not.toContain(irrelevant.id);
    });
  });

  describe('unranked search (sort key is createdAt)', () => {
    it('skips and duplicates nothing when a newer node is inserted between pages', async () => {
      const seeded = await seed(10);

      // createdAt DESC: a brand new node sorts first, again shifting OFFSET.
      const seen = await paginate({}, 3, async (page) => {
        if (page === 0) await addNode({ traffic: 1, minutesFromBase: 999 });
      });

      expect(new Set(seen).size).toBe(seen.length);
      expect(seen).toEqual(expect.arrayContaining(seeded));
    });

    it('returns every node exactly once when nothing changes', async () => {
      const seeded = await seed(10);

      const seen = await paginate({}, 4);

      expect(seen.slice().sort((a, b) => a - b)).toEqual(seeded.slice().sort((a, b) => a - b));
    });
  });

  it('demonstrates the offset pagination it replaces would corrupt the same read', async () => {
    // Contrast case, proving the scenarios above are genuinely adversarial and
    // not vacuously passing.
    const repo = dataSource.getRepository(MeshNode);
    await seed(10);

    const offsetPage = (page: number, limit: number) =>
      repo.find({
        order: { createdAt: 'DESC' },
        skip: (page - 1) * limit,
        take: limit,
      });

    const first = await offsetPage(1, 3);
    await addNode({ traffic: 1, minutesFromBase: 999 });
    const second = await offsetPage(2, 3);

    const ids = [...first, ...second].map((n) => n.id);
    expect(new Set(ids).size).toBeLessThan(ids.length);
  });
});
