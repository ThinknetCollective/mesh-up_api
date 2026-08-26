import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

export interface LogAuditOptions {
  action: string;
  entityType: string;
  entityId: string;
  userId?: string | null;
  metadata?: Record<string, any> | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
  ) {}

  async log(
    action: string,
    entityType: string,
    entityId: string,
    userId?: string | null,
    metadata?: Record<string, any> | null,
  ): Promise<AuditLog> {
    const entry = this.auditLogRepo.create({
      action,
      entityType,
      entityId,
      userId: userId ?? null,
      metadata: metadata ?? null,
    });

    const saved = await this.auditLogRepo.save(entry);
    this.logger.log(
      `Audit logged: [${action}] on [${entityType}:${entityId}] by [${userId || 'system'}]`,
    );
    return saved;
  }

  async findLogs(query?: {
    entityType?: string;
    entityId?: string;
    userId?: string;
    action?: string;
    limit?: number;
  }): Promise<AuditLog[]> {
    const qb = this.auditLogRepo.createQueryBuilder('audit').orderBy('audit.createdAt', 'DESC');

    if (query?.entityType) {
      qb.andWhere('audit.entityType = :entityType', { entityType: query.entityType });
    }
    if (query?.entityId) {
      qb.andWhere('audit.entityId = :entityId', { entityId: query.entityId });
    }
    if (query?.userId) {
      qb.andWhere('audit.userId = :userId', { userId: query.userId });
    }
    if (query?.action) {
      qb.andWhere('audit.action = :action', { action: query.action });
    }
    if (query?.limit) {
      qb.take(query.limit);
    }

    return qb.getMany();
  }
}
