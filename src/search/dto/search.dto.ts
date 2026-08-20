import { IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { DeprecatedOffsetPaginationQueryDto } from '../../common/dto/cursor-pagination-query.dto';

/**
 * Search filters plus the shared cursor pagination params.
 *
 * `cursor`, `limit` and the deprecated `page` are inherited rather than
 * redeclared, so search stays in step with the other list endpoints.
 */
export class SearchQueryDto extends DeprecatedOffsetPaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Full-text search term. When present, results are ranked by relevance ' +
      'instead of recency.',
    example: 'traffic congestion',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Filter by node type.' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ description: 'Filter by category.' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Filter by tag.' })
  @IsOptional()
  @IsString()
  tags?: string;

  @ApiPropertyOptional({ description: 'Only nodes created at or after this date.' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'Only nodes created at or before this date.' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
