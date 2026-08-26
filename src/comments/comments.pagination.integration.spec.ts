import { DataSource } from 'typeorm';
import { CommentsService } from './comments.service';
import { Comment } from './entities/comment.entity';
import { Solution } from '../solutions/entities/solution.entity';
import { AuditService } from '../audit/audit.service';
import { createInMemoryDataSource } from '../common/testing/in-memory-db';

/**
 * Integration coverage for the acceptance criterion:
 * "no duplicate or skipped items when items are inserted between page fetches".
 *
 * These run against pg-mem — a real Postgres SQL engine in memory — rather than
 * a mocked query builder, so the keyset predicate and ORDER BY are genuinely
 * parsed and evaluated. A mocked repository could only prove we *generate* the
 * right SQL, never that the SQL *behaves* correctly, which is the whole claim
 * being made here.
 */

const SOLUTION_ID = '11111111-1111-1111-1111-111111111111';
const BASE_TIME = Date.UTC(2026, 6, 20, 10, 0, 0);

/** Walk every page, collecting ids, running `between` after each fetch. */
async function paginate(
  service: CommentsService,
  limit: number,
  between?: (pageIndex: number) => Promise<void>,
): Promise<string[]> {
  const seen: string[] = [];
  let cursor: string | undefined;
  let pageIndex = 0;

  // Bound the loop so a cursor bug surfaces as a failed assertion rather than
  // hanging the suite.
  for (let guard = 0; guard < 50; guard++) {
    const page = await service.findAll(SOLUTION_ID, { cursor, limit });
    seen.push(...page.items.map((c) => c.id));

    if (!page.hasMore) return seen;

    cursor = page.nextCursor!;
    if (between) await between(pageIndex);
    pageIndex++;
  }

  throw new Error('pagination did not terminate');
}

describe('GET solutions/:id/comments — cursor stability under concurrent inserts', () => {
  let dataSource: DataSource;
  let service: CommentsService;
  let seq: number;

  beforeEach(async () => {
    dataSource = await createInMemoryDataSource({ entities: [Comment, Solution] });

    await dataSource.getRepository(Solution).save({
      id: SOLUTION_ID,
      content: 'a solution',
      status: 'active',
      score: 0,
    });

    service = new CommentsService(
      dataSource.getTreeRepository(Comment),
      dataSource.getRepository(Solution),
      { log: jest.fn() } as unknown as AuditService,
    );

    seq = 0;
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  /**
   * Insert a root comment at an explicit offset from BASE_TIME. A negative or
   * fractional offset backdates the row, placing it *earlier* in the ascending
   * sort — the case that corrupts offset pagination.
   */
  async function addComment(minutesFromBase: number): Promise<Comment> {
    const repo = dataSource.getTreeRepository(Comment);
    const comment = repo.create({
      // Deterministic, monotonically increasing uuids: the column is typed
      // uuid, and ascending ids keep the tiebreaker aligned with insert order
      // so the equal-timestamp assertions stay meaningful.
      id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
      content: `comment @${minutesFromBase}`,
      authorId: 'author-1',
      solutionId: SOLUTION_ID,
      depth: 0,
      parent: null,
      createdAt: new Date(BASE_TIME + minutesFromBase * 60_000),
    });
    seq++;
    return repo.save(comment);
  }

  async function seed(count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) ids.push((await addComment(i)).id);
    return ids;
  }

  it('returns every seeded comment exactly once when nothing changes', async () => {
    const seeded = await seed(10);

    const seen = await paginate(service, 3);

    expect(seen).toEqual(seeded);
  });

  it('skips and duplicates nothing when a comment is appended between pages', async () => {
    const seeded = await seed(10);

    // A normal new comment: newest timestamp, so it sorts last.
    const seen = await paginate(service, 3, async (page) => {
      if (page === 0) await addComment(100);
    });

    expect(new Set(seen).size).toBe(seen.length); // no duplicates
    expect(seen).toEqual(expect.arrayContaining(seeded)); // nothing skipped
  });

  it('skips and duplicates nothing when a backdated comment lands between pages', async () => {
    // The adversarial case: the insert lands *before* the reader's position,
    // which is exactly what shifts rows under OFFSET pagination.
    const seeded = await seed(10);

    const seen = await paginate(service, 3, async (page) => {
      if (page === 0) await addComment(0.5); // between comment 0 and 1
    });

    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(expect.arrayContaining(seeded));
  });

  it('survives an insert before every single page boundary', async () => {
    const seeded = await seed(12);

    let n = 0;
    const seen = await paginate(service, 3, async () => {
      // Backdate each insert into an already-consumed region of the ordering.
      await addComment(0.1 + n * 0.1);
      n++;
    });

    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toEqual(expect.arrayContaining(seeded));
  });

  it('keeps comments sharing an identical createdAt stable across a page boundary', async () => {
    // Without the id tiebreaker the sort is not a total order and rows with
    // equal timestamps can be re-emitted or dropped at the boundary.
    const ids: string[] = [];
    for (let i = 0; i < 9; i++) ids.push((await addComment(5)).id);

    const seen = await paginate(service, 3);

    expect(seen.slice().sort()).toEqual(ids.slice().sort());
    expect(new Set(seen).size).toBe(9);
  });

  it('demonstrates the offset pagination it replaces would corrupt the same read', async () => {
    // Contrast case: the identical scenario driven by skip/take, proving the
    // test above is actually exercising the failure mode and not a no-op.
    const repo = dataSource.getTreeRepository(Comment);
    await seed(10);

    const offsetPage = (page: number, limit: number) =>
      repo.find({
        where: { solutionId: SOLUTION_ID, depth: 0 },
        order: { createdAt: 'ASC' },
        skip: (page - 1) * limit,
        take: limit,
      });

    const first = await offsetPage(1, 3);
    await addComment(0.5); // same backdated insert as the test above
    const second = await offsetPage(2, 3);

    const ids = [...first, ...second].map((c) => c.id);
    expect(new Set(ids).size).toBeLessThan(ids.length); // a duplicate appeared
  });
});
