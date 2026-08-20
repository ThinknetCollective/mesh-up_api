import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { SearchService } from './search.service';
import { MeshNode } from '../mesh-nodes/entities/mesh-node.entity';
import { cursorScope, decodeCursor, encodeCursor } from '../common/utils/cursor.util';

const mockQb = {
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  addOrderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  offset: jest.fn().mockReturnThis(),
  getRawAndEntities: jest.fn(),
};

const mockRepo = { createQueryBuilder: jest.fn(() => mockQb) };

const node = (id: number, createdAt = new Date('2026-07-20T10:00:00.000Z')) =>
  ({ id, title: `node ${id}`, description: 'd', createdAt, updatedAt: createdAt }) as MeshNode;

/** The ranked spec the service builds internally, for minting test cursors. */
const rankedSpec = (q: string) => ({
  keys: [
    {
      expr:
        "ts_rank(to_tsvector('english', node.title || ' ' || node.description), " +
        "plainto_tsquery('english', :q))::double precision",
      type: 'number' as const,
      direction: 'DESC' as const,
      nulls: 'LAST' as const,
    },
    {
      expr: 'node.createdAt',
      type: 'date' as const,
      direction: 'DESC' as const,
      nulls: 'LAST' as const,
      nonNullable: true,
    },
  ],
  id: { expr: 'node.id', type: 'number' as const, direction: 'DESC' as const },
  scope: cursorScope({ q }),
});

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockQb.getRawAndEntities.mockResolvedValue({ entities: [], raw: [] });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SearchService,
        { provide: getRepositoryToken(MeshNode), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns the { items, nextCursor, hasMore } envelope with relevance scores', async () => {
    mockQb.getRawAndEntities.mockResolvedValue({
      entities: [node(1)],
      raw: [{ rank: '0.75' }],
    });

    const result = await service.search({ q: 'traffic' });

    expect(Object.keys(result).sort()).toEqual(['hasMore', 'items', 'nextCursor']);
    expect(result.items[0].relevanceScore).toBe(0.75);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
  });

  it('reports a null relevance score when no search term is given', async () => {
    mockQb.getRawAndEntities.mockResolvedValue({ entities: [node(1)], raw: [{}] });

    const result = await service.search({});

    expect(result.items[0].relevanceScore).toBeNull();
  });

  it('orders by the ts_rank expression, not the output alias', async () => {
    await service.search({ q: 'traffic' });

    const [expr, direction, nulls] = mockQb.orderBy.mock.calls[0];
    expect(expr).toContain('ts_rank(');
    expect(expr).not.toBe('rank');
    expect(direction).toBe('DESC');
    expect(nulls).toBe('NULLS LAST');
  });

  it('breaks relevance ties with createdAt then id', async () => {
    await service.search({ q: 'traffic' });

    expect(mockQb.addOrderBy).toHaveBeenCalledWith('node.createdAt', 'DESC', 'NULLS LAST');
    expect(mockQb.addOrderBy).toHaveBeenCalledWith('node.id', 'DESC', 'NULLS LAST');
  });

  it('orders by createdAt when no query string is provided', async () => {
    await service.search({});

    expect(mockQb.where).not.toHaveBeenCalled();
    expect(mockQb.orderBy).toHaveBeenCalledWith('node.createdAt', 'DESC', 'NULLS LAST');
  });

  it('applies dateFrom and dateTo filters', async () => {
    await service.search({ dateFrom: '2026-01-01', dateTo: '2026-12-31' });

    expect(mockQb.andWhere).toHaveBeenCalledWith('node.createdAt >= :dateFrom', {
      dateFrom: '2026-01-01',
    });
    expect(mockQb.andWhere).toHaveBeenCalledWith('node.createdAt <= :dateTo', {
      dateTo: '2026-12-31',
    });
  });

  it('over-fetches one row rather than issuing a COUNT', async () => {
    await service.search({ limit: 20 });

    expect(mockQb.limit).toHaveBeenCalledWith(21);
    expect(mockQb.offset).not.toHaveBeenCalled();
  });

  it('recomputes the ranking expression inside the cursor predicate', async () => {
    const spec = rankedSpec('traffic');
    const cursor = encodeCursor(spec, {
      values: [0.75, new Date('2026-07-20T10:00:00.000Z')],
      id: 42,
    });

    await service.search({ q: 'traffic', cursor });

    const keysetCall = mockQb.andWhere.mock.calls.find(
      ([sql]) => typeof sql === 'string' && sql.includes('ts_rank('),
    );
    expect(keysetCall).toBeDefined();
    // The comparison must re-evaluate ts_rank per row against a constant, and
    // must not shadow the caller's own :q binding.
    expect(keysetCall![0]).toContain('< :cursor_0');
    expect(keysetCall![1]).toMatchObject({ cursor_0: 0.75, cursor_2: 42 });
    expect(keysetCall![1]).not.toHaveProperty('q');
  });

  it('emits a cursor carrying the last row relevance score', async () => {
    mockQb.getRawAndEntities.mockResolvedValue({
      entities: [node(1), node(2), node(3)],
      raw: [{ rank: '0.9' }, { rank: '0.5' }, { rank: '0.1' }],
    });

    const result = await service.search({ q: 'traffic', limit: 2 });

    expect(result.hasMore).toBe(true);
    const decoded = decodeCursor(rankedSpec('traffic'), result.nextCursor!);
    expect(decoded.values[0]).toBe(0.5); // second row, not the sentinel
    expect(decoded.id).toBe(2);
  });

  it('rejects a cursor minted under a different search term', async () => {
    const foreign = encodeCursor(rankedSpec('water'), {
      values: [0.5, new Date()],
      id: 1,
    });

    await expect(service.search({ q: 'traffic', cursor: foreign })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a cursor minted under a different filter set', async () => {
    const base = rankedSpec('traffic');
    const filtered = { ...base, scope: cursorScope({ q: 'traffic', category: 'infra' }) };
    const cursor = encodeCursor(filtered, { values: [0.5, new Date()], id: 1 });

    await expect(service.search({ q: 'traffic', cursor })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('ignores the deprecated page param', async () => {
    mockQb.getRawAndEntities.mockResolvedValue({ entities: [node(1)], raw: [{}] });

    const withPage = await service.search({ page: 5, limit: 10 });
    const withoutPage = await service.search({ limit: 10 });

    expect(withPage).toEqual(withoutPage);
    expect(mockQb.offset).not.toHaveBeenCalled();
  });
});
