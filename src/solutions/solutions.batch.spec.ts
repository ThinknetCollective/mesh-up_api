import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { SolutionsService } from './solutions.service';
import { Solution } from './entities/solution.entity';
import { SolutionRevision } from './entities/solution-revision.entity';
import { ReputationService } from '../users/reputation.service';
import { AuditService } from '../audit/audit.service';

describe('SolutionsService.batchAction', () => {
  let service: SolutionsService;
  let solutionRepo: {
    findOneBy: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  let mockAuditService: {
    log: jest.Mock;
  };

  beforeEach(async () => {
    solutionRepo = {
      findOneBy: jest.fn(),
      save: jest.fn(),
      delete: jest.fn(),
    };
    mockAuditService = {
      log: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SolutionsService,
        {
          provide: getRepositoryToken(Solution),
          useValue: solutionRepo,
        },
        { provide: getRepositoryToken(SolutionRevision), useValue: {} },
        { provide: ReputationService, useValue: { addPoints: jest.fn() } },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get(SolutionsService);
  });

  it('returns per-item results for delete operations, soft-deletes and logs audit', async () => {
    solutionRepo.findOneBy.mockImplementation(({ id }) => {
      if (id === 'existing') {
        return Promise.resolve({ id, status: 'active' });
      }
      return Promise.resolve(null);
    });

    const result = await service.batchAction(
      { action: 'delete', solutionIds: ['existing', 'missing'] },
      { id: 'mod-1', role: 'moderator' },
    );

    expect(result).toEqual({
      results: [
        { id: 'existing', success: true },
        { id: 'missing', success: false, error: 'Not found' },
      ],
    });
    expect(solutionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'existing',
        deletedAt: expect.any(Date),
        deletedBy: 'mod-1',
      }),
    );
    expect(mockAuditService.log).toHaveBeenCalledWith(
      'DELETE_SOLUTION',
      'solution',
      'existing',
      'mod-1',
    );
  });

  it('bookmarks solutions for authenticated users', async () => {
    solutionRepo.findOneBy.mockResolvedValue({ id: 's-1', isBookmarked: false });

    const result = await service.batchAction(
      { action: 'bookmark', solutionIds: ['s-1'] },
      { id: 'user-1' },
    );

    expect(result.results).toEqual([{ id: 's-1', success: true }]);
    expect(solutionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's-1', isBookmarked: true, bookmarkedBy: 'user-1' }),
    );
  });

  it('rejects batches larger than 50 items', async () => {
    await expect(
      service.batchAction(
        {
          action: 'delete',
          solutionIds: Array.from({ length: 51 }, (_, index) => `s-${index}`),
        },
        { role: 'admin' },
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
