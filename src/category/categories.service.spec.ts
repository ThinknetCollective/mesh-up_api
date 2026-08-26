import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';
import { AuditService } from '../audit/audit.service';

describe('CategoriesService', () => {
  let service: CategoriesService;

  const mockCategoryRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn((c) => Promise.resolve(c)),
  };

  const mockAuditService = {
    log: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
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

    service = module.get<CategoriesService>(CategoriesService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should find active categories by default excluding soft-deleted', async () => {
      const categories = [{ id: 'cat-1', name: 'DeFi', deletedAt: null }];
      mockCategoryRepo.find.mockResolvedValue(categories);

      const result = await service.findAll();

      expect(result).toEqual(categories);
      expect(mockCategoryRepo.find).toHaveBeenCalledWith({
        where: { deletedAt: null },
        order: { name: 'ASC' },
      });
    });

    it('should find all categories including deleted when includeDeleted is true', async () => {
      const categories = [
        { id: 'cat-1', name: 'DeFi', deletedAt: null },
        { id: 'cat-2', name: 'NFTs', deletedAt: new Date() },
      ];
      mockCategoryRepo.find.mockResolvedValue(categories);

      const result = await service.findAll(true);

      expect(result).toEqual(categories);
      expect(mockCategoryRepo.find).toHaveBeenCalledWith({
        withDeleted: true,
        order: { name: 'ASC' },
      });
    });
  });

  describe('delete', () => {
    it('should soft-delete category, record deletedAt and deletedBy, and log in audit', async () => {
      const category = { id: 'cat-1', name: 'DeFi', deletedAt: null, deletedBy: null };
      mockCategoryRepo.findOne.mockResolvedValue(category);

      await service.delete('cat-1', 'admin-1');

      expect(mockCategoryRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'cat-1',
          deletedAt: expect.any(Date),
          deletedBy: 'admin-1',
        }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        'DELETE_CATEGORY',
        'category',
        'cat-1',
        'admin-1',
      );
    });

    it('should throw NotFoundException if category does not exist', async () => {
      mockCategoryRepo.findOne.mockResolvedValue(null);

      await expect(service.delete('missing-cat', 'admin-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
