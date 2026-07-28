import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { SolutionsService } from './solutions.service';
import { Solution } from './entities/solution.entity';
import { SolutionRevision } from './entities/solution-revision.entity';
import { ReputationService } from '../users/reputation.service';
import { cursorScope, decodeCursor, encodeCursor } from '../common/utils/cursor.util';

/** Mirrors the spec built inside SolutionsService, for minting test cursors. */
const spec = {
  keys: [
    {
      expr: 'solution.rank',
      type: 'number' as const,
      direction: 'ASC' as const,
      nulls: 'LAST' as const,
    },
    {
      expr: 'solution.createdAt',
      type: 'date' as const,
      direction: 'DESC' as const,
      nulls: 'LAST' as const,
      nonNullable: true,
    },
  ],
  id: { expr: 'solution.id', type: 'string' as const, direction: 'DESC' as const },
  scope: cursorScope({ status: 'active' }),
};

const solution = (id: string, rank: number | null, minute = 0): Solution =>
  ({
    id,
    content: 'c',
    status: 'active',
    rank,
    score: 0,
    createdAt: new Date(Date.UTC(2026, 6, 20, 10, minute)),
    updatedAt: new Date(Date.UTC(2026, 6, 20, 10, minute)),
  }) as Solution;

describe('SolutionsService.findAll (cursor pagination)', () => {
  let service: SolutionsService;
  let qb: Record<string, jest.Mock>;

  beforeEach(async () => {
    qb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SolutionsService,
        {
          provide: getRepositoryToken(Solution),
          useValue: { createQueryBuilder: jest.fn(() => qb) },
        },
        { provide: getRepositoryToken(SolutionRevision), useValue: {} },
        { provide: ReputationService, useValue: { addPoints: jest.fn() } },
      ],
    }).compile();

    service = module.get(SolutionsService);
  });

  it('returns the { items, nextCursor, hasMore } envelope', async () => {
    qb.getMany.mockResolvedValue([solution('s-1', 1), solution('s-2', 2)]);

    const result = await service.findAll({ limit: 5 });

    expect(Object.keys(result).sort()).toEqual(['hasMore', 'items', 'nextCursor']);
    expect(result.items).toHaveLength(2);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('excludes solutions hidden by moderation', async () => {
    await service.findAll({});

    expect(qb.where).toHaveBeenCalledWith('solution.status = :status', {
      status: 'active',
    });
  });

  it('orders by rank ascending with unranked solutions last, then createdAt, then id', async () => {
    await service.findAll({});

    expect(qb.orderBy).toHaveBeenCalledWith('solution.rank', 'ASC', 'NULLS LAST');
    expect(qb.addOrderBy).toHaveBeenCalledWith('solution.createdAt', 'DESC', 'NULLS LAST');
    expect(qb.addOrderBy).toHaveBeenCalledWith('solution.id', 'DESC', 'NULLS LAST');
  });

  it('over-fetches exactly one row rather than issuing a COUNT', async () => {
    await service.findAll({ limit: 20 });

    expect(qb.take).toHaveBeenCalledWith(21);
  });

  it('trims the sentinel row and emits a cursor for the last returned row', async () => {
    qb.getMany.mockResolvedValue([
      solution('s-1', 1),
      solution('s-2', 2),
      solution('s-3', 3),
      solution('s-4', 4),
    ]);

    const result = await service.findAll({ limit: 3 });

    expect(result.items.map((s) => s.id)).toEqual(['s-1', 's-2', 's-3']);
    expect(result.hasMore).toBe(true);

    const decoded = decodeCursor(spec, result.nextCursor!);
    expect(decoded.values[0]).toBe(3);
    expect(decoded.id).toBe('s-3');
  });

  it('carries a null rank through the cursor for unranked solutions', async () => {
    qb.getMany.mockResolvedValue([solution('s-1', null), solution('s-2', null)]);

    const result = await service.findAll({ limit: 1 });

    expect(decodeCursor(spec, result.nextCursor!).values[0]).toBeNull();
  });

  it('applies a keyset predicate when a cursor is supplied', async () => {
    const cursor = encodeCursor(spec, {
      values: [2, new Date(Date.UTC(2026, 6, 20, 10, 0))],
      id: 's-2',
    });

    await service.findAll({ cursor });

    const keysetCall = qb.andWhere.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('solution.rank'),
    );
    expect(keysetCall).toBeDefined();
    // rank ascends, createdAt and id descend.
    expect(keysetCall![0]).toContain('solution.rank > :cursor_0');
    expect(keysetCall![0]).toContain('solution.createdAt < :cursor_1');
    expect(keysetCall![0]).toContain('solution.id < :cursor_2');
  });

  it('treats a null-rank cursor as being in the unranked tail', async () => {
    const cursor = encodeCursor(spec, {
      values: [null, new Date(Date.UTC(2026, 6, 20, 10, 0))],
      id: 's-9',
    });

    await service.findAll({ cursor });

    const [sql] = qb.andWhere.mock.calls.find(
      ([s]) => typeof s === 'string' && s.includes('solution.rank'),
    )!;
    // Nothing sorts after NULL under NULLS LAST, so there must be no
    // standalone rank comparison — only the IS NULL prefix on deeper keys.
    expect(sql).toContain('solution.rank IS NULL');
    expect(sql).not.toContain('solution.rank >');
    expect(sql).not.toContain('solution.rank <');
  });

  it('issues no keyset predicate on the first page', async () => {
    await service.findAll({});

    const keysetCall = qb.andWhere.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('solution.rank'),
    );
    expect(keysetCall).toBeUndefined();
  });

  it('rejects a malformed cursor with 400 rather than 500', async () => {
    await expect(service.findAll({ cursor: 'garbage!!' })).rejects.toThrow(
      BadRequestException,
    );
  });
});
