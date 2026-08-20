import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { Comment } from './entities/comment.entity';
import { Solution } from '../solutions/entities/solution.entity';
import { decodeCursor, encodeCursor, cursorScope } from '../common/utils/cursor.util';

const SOLUTION_ID = 'sol-1';

/** Mirrors the spec built inside CommentsService, for minting test cursors. */
const specFor = (solutionId: string) => ({
  keys: [
    {
      expr: 'comment.createdAt',
      type: 'date' as const,
      direction: 'ASC' as const,
      nulls: 'LAST' as const,
      nonNullable: true,
    },
  ],
  id: { expr: 'comment.id', type: 'string' as const, direction: 'ASC' as const },
  scope: cursorScope({ solutionId }),
});

const makeComment = (i: number): Comment =>
  ({
    id: `c-${i}`,
    content: `comment ${i}`,
    authorId: 'author-1',
    solutionId: SOLUTION_ID,
    depth: 0,
    createdAt: new Date(Date.UTC(2026, 6, 20, 10, i)),
    children: [],
  }) as Comment;

describe('CommentsService.findAll (cursor pagination)', () => {
  let service: CommentsService;
  let qb: Record<string, jest.Mock>;
  let commentRepo: Record<string, jest.Mock>;
  let solutionRepo: Record<string, jest.Mock>;

  beforeEach(async () => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    commentRepo = {
      createQueryBuilder: jest.fn(() => qb),
      // Echo the root back, as a tree with no replies.
      findDescendantsTree: jest.fn((root: Comment) => Promise.resolve(root)),
    };

    solutionRepo = {
      findOne: jest.fn().mockResolvedValue({ id: SOLUTION_ID } as Solution),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentsService,
        { provide: getRepositoryToken(Comment), useValue: commentRepo },
        { provide: getRepositoryToken(Solution), useValue: solutionRepo },
      ],
    }).compile();

    service = module.get(CommentsService);
  });

  it('404s for an unknown solution', async () => {
    solutionRepo.findOne.mockResolvedValue(null);

    await expect(service.findAll(SOLUTION_ID, {})).rejects.toThrow(NotFoundException);
  });

  it('returns the { items, nextCursor, hasMore } envelope', async () => {
    qb.getMany.mockResolvedValue([makeComment(0), makeComment(1)]);

    const result = await service.findAll(SOLUTION_ID, { limit: 5 });

    expect(Object.keys(result).sort()).toEqual(['hasMore', 'items', 'nextCursor']);
    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('restricts the query to this solution root comments', async () => {
    await service.findAll(SOLUTION_ID, {});

    expect(qb.where).toHaveBeenCalledWith('comment.solutionId = :solutionId', {
      solutionId: SOLUTION_ID,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('comment.depth = 0');
  });

  it('orders by createdAt then id, both ascending, with explicit NULL placement', async () => {
    await service.findAll(SOLUTION_ID, {});

    expect(qb.orderBy).toHaveBeenCalledWith('comment.createdAt', 'ASC', 'NULLS LAST');
    expect(qb.addOrderBy).toHaveBeenCalledWith('comment.id', 'ASC', 'NULLS LAST');
  });

  it('over-fetches exactly one row to compute hasMore without a COUNT', async () => {
    await service.findAll(SOLUTION_ID, { limit: 20 });

    expect(qb.take).toHaveBeenCalledWith(21);
  });

  it('trims the sentinel row and emits a cursor pointing at the last returned row', async () => {
    // 3 requested, 4 returned → the 4th is the sentinel.
    qb.getMany.mockResolvedValue([0, 1, 2, 3].map(makeComment));

    const result = await service.findAll(SOLUTION_ID, { limit: 3 });

    expect(result.items.map((c) => c.id)).toEqual(['c-0', 'c-1', 'c-2']);
    expect(result.hasMore).toBe(true);
    expect(decodeCursor(specFor(SOLUTION_ID), result.nextCursor!).id).toBe('c-2');
  });

  it('does not load reply subtrees for the over-fetched sentinel row', async () => {
    qb.getMany.mockResolvedValue([0, 1, 2, 3].map(makeComment));

    await service.findAll(SOLUTION_ID, { limit: 3 });

    expect(commentRepo.findDescendantsTree).toHaveBeenCalledTimes(3);
  });

  it('applies a keyset predicate when a cursor is supplied', async () => {
    const spec = specFor(SOLUTION_ID);
    const cursor = encodeCursor(spec, {
      values: [new Date(Date.UTC(2026, 6, 20, 10, 2))],
      id: 'c-2',
    });

    await service.findAll(SOLUTION_ID, { cursor });

    const keysetCall = qb.andWhere.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('comment.createdAt >'),
    );
    expect(keysetCall).toBeDefined();
    expect(keysetCall![0]).toContain('comment.id >');
    expect(keysetCall![1]).toMatchObject({ cursor_1: 'c-2' });
  });

  it('issues no keyset predicate on the first page', async () => {
    await service.findAll(SOLUTION_ID, {});

    const keysetCall = qb.andWhere.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('comment.createdAt'),
    );
    expect(keysetCall).toBeUndefined();
  });

  it('rejects a cursor minted for a different solution', async () => {
    const foreign = encodeCursor(specFor('some-other-solution'), {
      values: [new Date()],
      id: 'c-9',
    });

    await expect(service.findAll(SOLUTION_ID, { cursor: foreign })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a malformed cursor with 400 rather than 500', async () => {
    await expect(
      service.findAll(SOLUTION_ID, { cursor: 'not-a-real-cursor!!' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('ignores the deprecated page param instead of rejecting it', async () => {
    qb.getMany.mockResolvedValue([makeComment(0)]);

    const withPage = await service.findAll(SOLUTION_ID, { page: 7, limit: 5 });
    const withoutPage = await service.findAll(SOLUTION_ID, { limit: 5 });

    expect(withPage).toEqual(withoutPage);
    // `page` must never reach the query as an offset.
    expect(qb.andWhere).not.toHaveBeenCalledWith(
      expect.stringContaining('OFFSET'),
      expect.anything(),
    );
  });
});
