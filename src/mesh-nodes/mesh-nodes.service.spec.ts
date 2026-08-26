import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { MeshNodesService } from './mesh-nodes.service';
import { MeshNode } from './entities/mesh-node.entity';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { ReputationService } from '../users/reputation.service';

describe('MeshNodesService', () => {
  let service: MeshNodesService;
  let repo: any;
  let embeddingsService: any;

  beforeEach(async () => {
    repo = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOneBy: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      setParameter: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(),
    };

    embeddingsService = {
      generateEmbedding: jest.fn(),
      modelVersion: 'test-model',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeshNodesService,
        {
          provide: getRepositoryToken(MeshNode),
          useValue: repo,
        },
        {
          provide: EmbeddingsService,
          useValue: embeddingsService,
        },
        {
          provide: ReputationService,
          useValue: { addPoints: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<MeshNodesService>(MeshNodesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should throw BadRequestException if similarity > 0.8', async () => {
      embeddingsService.generateEmbedding.mockResolvedValue([0.1, 0.2]);
      repo.getRawMany.mockResolvedValue([{ id: 1, title: 'Existing', similarity: 0.9 }]);

      await expect(service.create({ title: 'New', description: 'Dupe' }))
        .rejects.toThrow(BadRequestException);
    });

    it('should create and save a new node if no similar ones exist', async () => {
      embeddingsService.generateEmbedding.mockResolvedValue([0.1, 0.2]);
      repo.getRawMany.mockResolvedValue([]);
      repo.create.mockReturnValue({ id: 1, title: 'New' });
      repo.save.mockResolvedValue({ id: 1, title: 'New' });

      const result = await service.create({ title: 'New', description: 'Unique' });
      expect(result).toEqual({ id: 1, title: 'New' });
      expect(repo.save).toHaveBeenCalled();
    });
  });

  describe('findSimilar', () => {
    it('should return similar nodes with parsed similarity', async () => {
      embeddingsService.generateEmbedding.mockResolvedValue([0.1, 0.2]);
      repo.getRawMany.mockResolvedValue([{ id: 1, title: 'Sim', similarity: '0.85' }]);

      const result = await service.findSimilar('test');
      expect(result).toEqual([{ id: 1, title: 'Sim', similarity: 0.85 }]);
    });
  });
});
