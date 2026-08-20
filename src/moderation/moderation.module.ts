import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModerationService } from './moderation.service';
import { ModerationController } from './moderation.controller';
import { Report } from './entities/report.entity';
import { Solution } from '../solutions/entities/solution.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Report, Solution])],
  providers: [ModerationService],
  controllers: [ModerationController],
  exports: [ModerationService],
})
export class ModerationModule {}
