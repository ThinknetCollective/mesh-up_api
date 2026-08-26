import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AnalyticsService } from './analytics.service';
import { MeshNode } from '../mesh-nodes/entities/mesh-node.entity';
import { Solution } from '../solutions/entities/solution.entity';

describe('AnalyticsService (soft-delete exclusion)', () => {
  let service: AnalyticsService;
  let mockMeshNodeRepo: any;
  let mockSolutionRepo: any;
  let nodeQb: any;
  let solutionQb: any;

  beforeEach(async () => {
    nodeQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([]),
    };

    solutionQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      distinct: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ avg: '75.5' }),
      getRawMany: jest.fn().mockResolvedValue([]),
    };

    mockMeshNodeRepo = {
      count: jest.fn().mockResolvedValue(10),
      createQueryBuilder: jest.fn(() => nodeQb),
    };

    mockSolutionRepo = {
      count: jest.fn().mockResolvedValue(25),
      createQueryBuilder: jest.fn(() => solutionQb),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: getRepositoryToken(MeshNode),
          useValue: mockMeshNodeRepo,
        },
        {
          provide: getRepositoryToken(Solution),
          useValue: mockSolutionRepo,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  it('excludes soft-deleted solutions when computing avg quality score and active authors', async () => {
    await service.getOverview();

    expect(mockSolutionRepo.count).toHaveBeenCalled();
    expect(solutionQb.where).toHaveBeenCalledWith('solution.deletedAt IS NULL');
  });

  it('excludes soft-deleted solutions in trends query', async () => {
    await service.getTrends(7);

    expect(solutionQb.andWhere).toHaveBeenCalledWith('solution.deletedAt IS NULL');
  });

  it('excludes soft-deleted solutions in top users query', async () => {
    await service.getTopUsers(5);

    expect(solutionQb.andWhere).toHaveBeenCalledWith('solution.deletedAt IS NULL');
  });
});
