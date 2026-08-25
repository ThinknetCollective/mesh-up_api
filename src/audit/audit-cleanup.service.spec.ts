import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditCleanupService } from './audit-cleanup.service';
import { AuditService } from './audit.service';
import { Solution } from '../solutions/entities/solution.entity';
import { Comment } from '../comments/entities/comment.entity';
import { Category } from '../category/entities/category.entity';

describe('AuditCleanupService', () => {
  let service: AuditCleanupService;

  const mockSolutionRepo = {
    find: jest.fn(),
    delete: jest.fn(),
  };

  const mockCommentRepo = {
    find: jest.fn(),
    delete: jest.fn(),
  };

  const mockCategoryRepo = {
    find: jest.fn(),
    delete: jest.fn(),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditCleanupService,
        {
          provide: getRepositoryToken(Solution),
          useValue: mockSolutionRepo,
        },
        {
          provide: getRepositoryToken(Comment),
          useValue: mockCommentRepo,
        },
        {
          provide: getRepositoryToken(Category),
          useValue: mockCategoryRepo,
        },
        {
          provide: AuditService,
          useValue: mockAuditService,
        },
      ],
    }).compile();

    service = module.get<AuditCleanupService>(AuditCleanupService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('purgeSoftDeleted', () => {
    it('should find and delete expired records across solutions, comments, categories and log audit', async () => {
      mockSolutionRepo.find.mockResolvedValue([
        { id: 'sol-1', deletedAt: new Date(Date.now() - 40 * 86400000) },
        { id: 'sol-2', deletedAt: new Date(Date.now() - 35 * 86400000) },
      ]);
      mockCommentRepo.find.mockResolvedValue([
        { id: 'com-1', deletedAt: new Date(Date.now() - 50 * 86400000) },
      ]);
      mockCategoryRepo.find.mockResolvedValue([
        { id: 'cat-1', deletedAt: new Date(Date.now() - 31 * 86400000) },
      ]);

      mockSolutionRepo.delete.mockResolvedValue({ affected: 2 });
      mockCommentRepo.delete.mockResolvedValue({ affected: 1 });
      mockCategoryRepo.delete.mockResolvedValue({ affected: 1 });

      const result = await service.purgeSoftDeleted(30);

      expect(result.solutionsPurged).toBe(2);
      expect(result.commentsPurged).toBe(1);
      expect(result.categoriesPurged).toBe(1);

      expect(mockSolutionRepo.delete).toHaveBeenCalledWith(['sol-1', 'sol-2']);
      expect(mockCommentRepo.delete).toHaveBeenCalledWith(['com-1']);
      expect(mockCategoryRepo.delete).toHaveBeenCalledWith(['cat-1']);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        'PURGE_RECORDS',
        'system',
        'all',
        'system',
        expect.objectContaining({
          solutionsPurged: 2,
          commentsPurged: 1,
          categoriesPurged: 1,
        }),
      );
    });

    it('should handle zero expired records without performing deletes or logging purge audit', async () => {
      mockSolutionRepo.find.mockResolvedValue([]);
      mockCommentRepo.find.mockResolvedValue([]);
      mockCategoryRepo.find.mockResolvedValue([]);

      const result = await service.purgeSoftDeleted(30);

      expect(result.solutionsPurged).toBe(0);
      expect(result.commentsPurged).toBe(0);
      expect(result.categoriesPurged).toBe(0);

      expect(mockSolutionRepo.delete).not.toHaveBeenCalled();
      expect(mockCommentRepo.delete).not.toHaveBeenCalled();
      expect(mockCategoryRepo.delete).not.toHaveBeenCalled();
      expect(mockAuditService.log).not.toHaveBeenCalled();
    });

    it('should invoke purgeSoftDeleted from handleScheduledPurge', async () => {
      const purgeSpy = jest.spyOn(service, 'purgeSoftDeleted').mockResolvedValue({
        solutionsPurged: 0,
        commentsPurged: 0,
        categoriesPurged: 0,
        cutoffDate: new Date(),
      });

      await service.handleScheduledPurge();
      expect(purgeSpy).toHaveBeenCalledWith(30);
    });
  });
});
