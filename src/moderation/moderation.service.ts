import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report, ReportStatus } from './entities/report.entity';
import { Solution } from '../solutions/entities/solution.entity';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportStatusDto } from './dto/update-report-status.dto';

@Injectable()
export class ModerationService {
  private readonly bannedKeywords = ['spam', 'profanity', 'offensive', 'badword']; // Simplified for demo

  constructor(
    @InjectRepository(Report)
    private readonly reportRepository: Repository<Report>,
    @InjectRepository(Solution)
    private readonly solutionRepository: Repository<Solution>,
  ) {}

  async reportSolution(solutionId: string, reporterId: string, createReportDto: CreateReportDto) {
    const solution = await this.solutionRepository.findOne({ where: { id: solutionId } });
    if (!solution) {
      throw new NotFoundException(`Solution with ID ${solutionId} not found`);
    }

    const report = this.reportRepository.create({
      ...createReportDto,
      solutionId,
      reporterId,
    });

    // Auto-flag based on keywords
    if (this.containsBannedKeywords(createReportDto.description || '')) {
      report.status = ReportStatus.PENDING;
      // You could also add a 'flagged' property or log it
    }

    await this.reportRepository.save(report);

    // Auto-hide logic: 3+ reports
    const reportCount = await this.reportRepository.count({
      where: { solutionId, status: ReportStatus.PENDING },
    });

    if (reportCount >= 3) {
      solution.status = 'hidden';
      await this.solutionRepository.save(solution);
    }

    return report;
  }

  async getModerationQueue() {
    return this.reportRepository.find({
      where: { status: ReportStatus.PENDING },
      order: { createdAt: 'DESC' },
    });
  }

  async updateReportStatus(reportId: string, updateDto: UpdateReportStatusDto) {
    const report = await this.reportRepository.findOne({ where: { id: reportId } });
    if (!report) {
      throw new NotFoundException(`Report with ID ${reportId} not found`);
    }

    report.status = updateDto.status;
    await this.reportRepository.save(report);

    // If approved, ensure content is hidden (if it wasn't already)
    if (updateDto.status === ReportStatus.APPROVED) {
      const solution = await this.solutionRepository.findOne({ where: { id: report.solutionId } });
      if (solution) {
        solution.status = 'hidden';
        await this.solutionRepository.save(solution);
      }
    } else if (updateDto.status === ReportStatus.REJECTED) {
        // If rejected, check if we should unhide it (only if no other pending/approved reports)
        const activeReports = await this.reportRepository.count({
            where: { solutionId: report.solutionId, status: ReportStatus.APPROVED }
        });
        if (activeReports === 0) {
            const solution = await this.solutionRepository.findOne({ where: { id: report.solutionId } });
            if (solution && solution.status === 'hidden') {
                solution.status = 'active';
                await this.solutionRepository.save(solution);
            }
        }
    }

    return report;
  }

  private containsBannedKeywords(text: string): boolean {
    const lowerText = text.toLowerCase();
    return this.bannedKeywords.some(keyword => lowerText.includes(keyword));
  }
}
