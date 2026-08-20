import { Controller, Post, Get, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportStatusDto } from './dto/update-report-status.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('api/v1')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post('solutions/:id/report')
  async reportSolution(
    @Param('id') id: string,
    @Body() createReportDto: CreateReportDto,
    @Request() req: any,
  ) {
    // Assuming req.user is populated by a JWT guard (which we should add)
    const reporterId = req.user?.sub || req.user?.id || 'anonymous';
    return this.moderationService.reportSolution(id, reporterId, createReportDto);
  }

  @Get('moderation/queue')
  @Roles('moderator')
  async getQueue() {
    return this.moderationService.getModerationQueue();
  }

  @Patch('moderation/reports/:id')
  @Roles('moderator')
  async updateReport(
    @Param('id') id: string,
    @Body() updateReportStatusDto: UpdateReportStatusDto,
  ) {
    return this.moderationService.updateReportStatus(id, updateReportStatusDto);
  }
}
