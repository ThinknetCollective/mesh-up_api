import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthService } from '../auth/auth.service';
import { Role } from './entities/user.entity';
import { RolesGuard } from '../auth/roles.guard';
import { Reflector } from '@nestjs/core';

describe('UsersController', () => {
  let controller: UsersController;
  let usersService: {
    getReputation: jest.Mock;
    updateRole: jest.Mock;
    getRoleAuditLog: jest.Mock;
  };

  beforeEach(async () => {
    usersService = {
      getReputation: jest.fn(),
      updateRole: jest.fn(),
      getRoleAuditLog: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: AuthService, useValue: { validateToken: jest.fn() } },
        RolesGuard,
        Reflector,
      ],
    }).compile();

    controller = module.get(UsersController);
  });

  describe('getReputation', () => {
    it('returns reputation and badge for a user', async () => {
      usersService.getReputation.mockResolvedValue({ reputation: 150, badge: 'Bronze' });

      const result = await controller.getReputation('u1');

      expect(result).toEqual({ reputation: 150, badge: 'Bronze' });
      expect(usersService.getReputation).toHaveBeenCalledWith('u1');
    });
  });

  describe('updateRole', () => {
    it('delegates to usersService.updateRole with correct parameters', async () => {
      const expected = { id: 'u1', role: Role.MODERATOR, previousRole: Role.USER };
      usersService.updateRole.mockResolvedValue(expected);

      const req = { user: { sub: 'admin-1', role: Role.ADMIN } };
      const result = await controller.updateRole('u1', { role: Role.MODERATOR }, req);

      expect(result).toEqual(expected);
      expect(usersService.updateRole).toHaveBeenCalledWith('u1', Role.MODERATOR, 'admin-1');
    });
  });

  describe('getRoleAuditLog', () => {
    it('returns the audit log entries', async () => {
      const logs = [{ id: 'log-1', newRole: Role.ADMIN }];
      usersService.getRoleAuditLog.mockResolvedValue(logs);

      const result = await controller.getRoleAuditLog();

      expect(result).toEqual(logs);
    });
  });
});
