import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThan, Repository } from 'typeorm';
import { Solution } from '../solutions/entities/solution.entity';
import { Comment } from '../comments/entities/comment.entity';
import { Category } from '../category/entities/category.entity';
import { AuditService } from './audit.service';

export interface PurgeResult {
  solutionsPurged: number;
  commentsPurged: number;
  categoriesPurged: number;
  cutoffDate: Date;
}

@Injectable()
export class AuditCleanupService {
  private readonly logger = new Logger(AuditCleanupService.name);

  constructor(
    @InjectRepository(Solution)
    private readonly solutionRepo: Repository<Solution>,
    @InjectRepository(Comment)
    private readonly commentRepo: Repository<Comment>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Daily scheduled task to clean up records older than 30 days.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleScheduledPurge(): Promise<PurgeResult> {
    return this.purgeSoftDeleted(30);
  }

  /**
   * Permanently purges soft-deleted records older than `retentionDays` (default: 30 days).
   * Also records an audit log for the purge operation.
   */
  async purgeSoftDeleted(retentionDays = 30): Promise<PurgeResult> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    this.logger.log(
      `Starting permanent purge of soft-deleted records older than ${retentionDays} days (cutoff: ${cutoffDate.toISOString()})...`,
    );

    // 1. Purge soft-deleted solutions
    const expiredSolutions = await this.solutionRepo.find({
      withDeleted: true,
      where: { deletedAt: LessThan(cutoffDate) },
    });
    let solutionsPurged = 0;
    if (expiredSolutions.length > 0) {
      await this.solutionRepo.delete(expiredSolutions.map((s) => s.id));
      solutionsPurged = expiredSolutions.length;
    }

    // 2. Purge soft-deleted comments
    const expiredComments = await this.commentRepo.find({
      withDeleted: true,
      where: { deletedAt: LessThan(cutoffDate) },
    });
    let commentsPurged = 0;
    if (expiredComments.length > 0) {
      await this.commentRepo.delete(expiredComments.map((c) => c.id));
      commentsPurged = expiredComments.length;
    }

    // 3. Purge soft-deleted categories
    const expiredCategories = await this.categoryRepo.find({
      withDeleted: true,
      where: { deletedAt: LessThan(cutoffDate) },
    });
    let categoriesPurged = 0;
    if (expiredCategories.length > 0) {
      await this.categoryRepo.delete(expiredCategories.map((cat) => cat.id));
      categoriesPurged = expiredCategories.length;
    }

    const result: PurgeResult = {
      solutionsPurged,
      commentsPurged,
      categoriesPurged,
      cutoffDate,
    };

    if (solutionsPurged > 0 || commentsPurged > 0 || categoriesPurged > 0) {
      await this.auditService.log('PURGE_RECORDS', 'system', 'all', 'system', result);
    }

    this.logger.log(
      `Purge completed: ${solutionsPurged} solutions, ${commentsPurged} comments, ${categoriesPurged} categories permanently removed.`,
    );

    return result;
  }
}
