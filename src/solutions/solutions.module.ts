import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Solution } from './entities/solution.entity';
import { SolutionRevision } from './entities/solution-revision.entity';
import { SolutionsService } from './solutions.service';
import { SolutionsController } from './solutions.controller';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
import { Vote } from './entities/vote.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Solution, SolutionRevision, Vote]),
    UsersModule,
    AuditModule,
  ],
  providers: [SolutionsService],
  controllers: [SolutionsController],
  exports: [SolutionsService],
})
export class SolutionsModule {}
