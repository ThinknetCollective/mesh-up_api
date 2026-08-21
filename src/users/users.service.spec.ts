import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User, Role } from './entities/user.entity';
import { RoleAuditLog } from './entities/role-audit-log.entity';

describe('UsersService', () => {
  let service: UsersService;
  let userRepo: {
    findOneBy: jest.Mock;
    save: jest.Mock;
  };
  let auditLogRepo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
  };

  beforeEach(async () => {
    userRepo = {
      findOneBy: jest.fn(),
      save: jest.fn(),
    };
    auditLogRepo = {
      create: jest.fn((dto) => dto),
      save: jest.fn((entity) => Promise.resolve(entity)),
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(RoleAuditLog), useValue: auditLogRepo },
      ],
    }).compile();

    service = module.get(UsersService);
  });

  describe('findOne', () => {
    it('returns the user when found', async () => {
      const user = { id: 'u1', role: Role.USER, reputation: 0 };
      userRepo.findOneBy.mockResolvedValue(user);

      const result = await service.findOne('u1');
      expect(result).toEqual(user);
    });

    it('throws NotFoundException when user does not exist', async () => {
      userRepo.findOneBy.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getBadge', () => {
    it.each([
      [1000, 'Gold'],
      [1500, 'Gold'],
      [500, 'Silver'],
      [999, 'Silver'],
      [100, 'Bronze'],
      [499, 'Bronze'],
      [99, 'None'],
      [0, 'None'],
    ])('returns %s badge for reputation %i', (reputation, expected) => {
      expect(service.getBadge(reputation)).toBe(expected);
    });
  });

  describe('updateRole', () => {
    it('updates the user role and creates an audit log entry', async () => {
      const user = { id: 'u1', role: Role.USER, reputation: 0 };
      userRepo.findOneBy.mockResolvedValue(user);
      userRepo.save.mockResolvedValue({ ...user, role: Role.MODERATOR });

      const result = await service.updateRole('u1', Role.MODERATOR, 'admin-1');

      expect(result).toEqual({
        id: 'u1',
        role: Role.MODERATOR,
        previousRole: Role.USER,
      });

      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u1', role: Role.MODERATOR }),
      );

      expect(auditLogRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          targetUserId: 'u1',
          changedByUserId: 'admin-1',
          previousRole: Role.USER,
          newRole: Role.MODERATOR,
        }),
      );
    });

    it('throws NotFoundException if the target user does not exist', async () => {
      userRepo.findOneBy.mockResolvedValue(null);

      await expect(
        service.updateRole('missing', Role.ADMIN, 'admin-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getRoleAuditLog', () => {
    it('returns audit log entries ordered by createdAt DESC', async () => {
      const logs = [
        { id: 'log-1', targetUserId: 'u1', newRole: Role.ADMIN, createdAt: new Date() },
      ];
      auditLogRepo.find.mockResolvedValue(logs);

      const result = await service.getRoleAuditLog();

      expect(auditLogRepo.find).toHaveBeenCalledWith({
        where: {},
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(logs);
    });

    it('filters by target user when provided', async () => {
      auditLogRepo.find.mockResolvedValue([]);

      await service.getRoleAuditLog('u1');

      expect(auditLogRepo.find).toHaveBeenCalledWith({
        where: { targetUserId: 'u1' },
        order: { createdAt: 'DESC' },
      });
    });
  });
});
