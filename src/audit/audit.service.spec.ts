import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';

describe('AuditService', () => {
  let service: AuditService;

  const mockAuditLogRepo = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockImplementation((entry) =>
      Promise.resolve({
        id: 'audit-uuid-1',
        ...entry,
        createdAt: new Date(),
      }),
    ),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockAuditLogRepo,
        },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('log', () => {
    it('should create and save an audit log entry', async () => {
      const result = await service.log(
        'DELETE_SOLUTION',
        'solution',
        'sol-123',
        'user-456',
        { reason: 'Duplicate content' },
      );

      expect(mockAuditLogRepo.create).toHaveBeenCalledWith({
        action: 'DELETE_SOLUTION',
        entityType: 'solution',
        entityId: 'sol-123',
        userId: 'user-456',
        metadata: { reason: 'Duplicate content' },
      });
      expect(mockAuditLogRepo.save).toHaveBeenCalled();
      expect(result.id).toBe('audit-uuid-1');
      expect(result.action).toBe('DELETE_SOLUTION');
    });

    it('should handle log entry with null user and metadata', async () => {
      const result = await service.log('PURGE_RECORDS', 'system', 'all');

      expect(mockAuditLogRepo.create).toHaveBeenCalledWith({
        action: 'PURGE_RECORDS',
        entityType: 'system',
        entityId: 'all',
        userId: null,
        metadata: null,
      });
      expect(result.userId).toBeNull();
    });
  });

  describe('findLogs', () => {
    it('should build query with filters and return matching audit logs', async () => {
      const mockQueryBuilder = {
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'audit-1',
            action: 'DELETE_COMMENT',
            entityType: 'comment',
            entityId: 'c-1',
            userId: 'u-1',
            createdAt: new Date(),
          },
        ]),
      };
      mockAuditLogRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const logs = await service.findLogs({
        entityType: 'comment',
        userId: 'u-1',
        action: 'DELETE_COMMENT',
        limit: 10,
      });

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'audit.entityType = :entityType',
        { entityType: 'comment' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'audit.userId = :userId',
        { userId: 'u-1' },
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'audit.action = :action',
        { action: 'DELETE_COMMENT' },
      );
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
      expect(logs).toHaveLength(1);
      expect(logs[0].action).toBe('DELETE_COMMENT');
    });
  });
});
