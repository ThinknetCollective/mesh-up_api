import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { AuditService } from './audit.service';
import { AuditCleanupService } from './audit-cleanup.service';
import { Solution } from '../solutions/entities/solution.entity';
import { Comment } from '../comments/entities/comment.entity';
import { Category } from '../category/entities/category.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog, Solution, Comment, Category])],
  providers: [AuditService, AuditCleanupService],
  exports: [AuditService, AuditCleanupService],
})
export class AuditModule {}
