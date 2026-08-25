import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, Role } from './entities/user.entity';
import { RoleAuditLog } from './entities/role-audit-log.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(RoleAuditLog)
    private readonly auditLogRepo: Repository<RoleAuditLog>,
  ) {}

  async findOne(id: string): Promise<User> {
    const user = await this.userRepo.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  getBadge(reputation: number): string {
    if (reputation >= 1000) return 'Gold';
    if (reputation >= 500) return 'Silver';
    if (reputation >= 100) return 'Bronze';
    return 'None';
  }

  async getReputation(id: string) {
    const user = await this.findOne(id);
    return {
      reputation: user.reputation,
      badge: this.getBadge(user.reputation),
    };
  }

  async updateRole(targetUserId: string, newRole: Role, changedByUserId: string) {
    const user = await this.findOne(targetUserId);
    const previousRole = user.role;

    user.role = newRole;
    await this.userRepo.save(user);

    await this.auditLogRepo.save(
      this.auditLogRepo.create({
        targetUserId,
        changedByUserId,
        previousRole,
        newRole,
      }),
    );

    return {
      id: user.id,
      role: user.role,
      previousRole,
    };
  }

  async getRoleAuditLog(targetUserId?: string) {
    const where = targetUserId ? { targetUserId } : {};
    return this.auditLogRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }
}
