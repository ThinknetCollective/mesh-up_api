import { DataSource } from 'typeorm';
import { SolutionsService } from './solutions.service';
import { Solution } from './entities/solution.entity';
import { SolutionRevision } from './entities/solution-revision.entity';
import { ReputationService } from '../users/reputation.service';
import { AuditService } from '../audit/audit.service';
import { createInMemoryDataSource } from '../common/testing/in-memory-db';

/**
 * Acceptance criterion for GET /v1/solutions:
 * "no duplicate or skipped items when items are inserted between page fetches".
 *
 * Runs against pg-mem, a real Postgres SQL engine in memory, so the keyset
 * predicate and its NULLS LAST ordering are genuinely evaluated rather than
 * asserted against a mock.
 */

const BASE_TIME = Date.UTC(2026, 6, 20, 10, 0, 0);

describe('GET /v1/solutions — cursor stability under concurrent writes', () => {
  let dataSource: DataSource;
  let service: SolutionsService;
  let seq: number;

  beforeEach(async () => {
    dataSource = await createInMemoryDataSource({
      entities: [Solution, SolutionRevision],
    });

    service = new SolutionsService(
      dataSource.getRepository(Solution),
      dataSource.getRepository(SolutionRevision),
      { addPoints: jest.fn() } as unknown as ReputationService,
      { log: jest.fn() } as unknown as AuditService,
    );

    seq = 0;
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  async function addSolution(opts: {
    rank?: number | null;
    status?: string;
    minutesFromBase?: number;
  }): Promise<Solution> {
    const repo = dataSource.getRepository(Solution);
    const saved = await repo.save(
      repo.create({
        content: `solution ${seq}`,
        status: opts.status ?? 'active',
        authorId: 'author-1',
        rank: opts.rank ?? null,
        score: 0,
        createdAt: new Date(BASE_TIME + (opts.minutesFromBase ?? seq) * 60_000),
      }),
    );
    seq++;
    return saved;
  }

  /** Walk every page, running `between` after each fetch. */
  async function paginate(
    limit: number,
    between?: (pageIndex: number) => Promise<void>,
  ): Promise<string[]> {
    const seen: string[] = [];
    let cursor: string | undefined;
    let pageIndex = 0;

    for (let guard = 0; guard < 50; guard++) {
      const page = await service.findAll({ cursor, limit });
      seen.push(...page.items.map((s) => s.id));

      if (!page.hasMore) return seen;

      cursor = page.nextCursor!;
      if (between) await between(pageIndex);
      pageIndex++;
    }

    throw new Error('pagination did not terminate');
  }

  /** Ranked 1..count, so every page boundary sits inside the ranked region. */
  async function seedRanked(count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) ids.push((await addSolution({ rank: i + 1 })).id);
    return ids;
  }

  it('returns every solution exactly once when nothing changes', async () => {
    const seeded = await seedRanked(10);

    const seen = await paginate(3);

    expect(seen).toEqual(seeded);
  });

  it('orders ranked solutions first and unranked ones last', async () => {
    const unranked = await addSolution({ rank: null });
    const ranked = await addSolution({ rank: 1 });

    const seen = await paginate(10);

    expect(seen).toEqual([ranked.id, unranked.id]);
  });

  it('skips and duplicates nothing when a top-ranked solution is inserted between pages', async () => {
    const seeded = await seedRanked(10);

    // rank 0 sorts ahead of everything, the position that shifts every later
    // row under OFFSET pagination.
    const seen = await paginate(3, async (page) => {
      if (page === 0) await addSolution({ rank: 0 });
    });

    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(expect.arrayContaining(seeded));
  });

  it('survives an insert before every single page boundary', async () => {
    const seeded = await seedRanked(12);

    const seen = await paginate(3, async () => {
      await addSolution({ rank: 0 });
    });

    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(expect.arrayContaining(seeded));
  });

  it('paginates the unranked tail without duplicates or gaps', async () => {
    // Every rank is NULL, so ordering rests entirely on createdAt + id and the
    // cursor has to carry a null sort key across each boundary.
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) ids.push((await addSolution({ rank: null })).id);

    const seen = await paginate(3);

    expect(new Set(seen).size).toBe(10);
    expect(seen.slice().sort()).toEqual(ids.slice().sort());
  });

  it('crosses the ranked-to-unranked boundary without losing rows', async () => {
    const ranked: string[] = [];
    for (let i = 0; i < 4; i++) ranked.push((await addSolution({ rank: i + 1 })).id);
    const unranked: string[] = [];
    for (let i = 0; i < 5; i++) unranked.push((await addSolution({ rank: null })).id);

    // limit 3 puts a page boundary right where NULLS LAST takes over.
    const seen = await paginate(3);

    expect(new Set(seen).size).toBe(9);
    expect(seen.slice(0, 4)).toEqual(ranked);
    expect(seen.slice(4).sort()).toEqual(unranked.slice().sort());
  });

  it('skips and duplicates nothing when an unranked solution gains a rank mid-pagination', async () => {
    // Unique to this endpoint: `rank` is mutable (PATCH :id/rank), so a row can
    // jump from the unranked tail to the front while a reader is midway.
    // Keyset pagination cannot promise to show a row that moves behind the
    // reader, but it must never duplicate or drop the rows that stayed put.
    const ranked: string[] = [];
    for (let i = 0; i < 4; i++) ranked.push((await addSolution({ rank: i + 1 })).id);
    const unranked: string[] = [];
    for (let i = 0; i < 5; i++) unranked.push((await addSolution({ rank: null })).id);

    const promoted = unranked[4];
    const stayPut = [...ranked, ...unranked.slice(0, 4)];

    const seen = await paginate(3, async (page) => {
      if (page === 0) {
        await dataSource.getRepository(Solution).update(promoted, { rank: 0 });
      }
    });

    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(expect.arrayContaining(stayPut));
  });

  it('never leaks solutions hidden by moderation', async () => {
    const visible = await seedRanked(4);
    const hidden = await addSolution({ rank: 0, status: 'hidden' });

    const seen = await paginate(2);

    expect(seen).not.toContain(hidden.id);
    expect(seen.slice().sort()).toEqual(visible.slice().sort());
  });

  it('demonstrates the offset pagination it replaces would corrupt the same read', async () => {
    // Contrast case, proving the scenarios above are genuinely adversarial.
    const repo = dataSource.getRepository(Solution);
    await seedRanked(10);

    const offsetPage = (page: number, limit: number) =>
      repo.find({
        where: { status: 'active' },
        order: { rank: 'ASC' },
        skip: (page - 1) * limit,
        take: limit,
      });

    const first = await offsetPage(1, 3);
    await addSolution({ rank: 0 });
    const second = await offsetPage(2, 3);

    const ids = [...first, ...second].map((s) => s.id);
    expect(new Set(ids).size).toBeLessThan(ids.length);
  });
});
