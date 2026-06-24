import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ReportReason } from '../enums/report-reason.enum';

export class CreateReportDto {
  @IsEnum(ReportReason)
  @IsNotEmpty()
  reason: ReportReason;

  @IsString()
  @IsOptional()
  description?: string;
}
