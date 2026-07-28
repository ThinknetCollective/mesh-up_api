import {
  Controller,
  Post,
  Patch,
  Get,
  Body,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SolutionsService } from './solutions.service';
import { CursorPaginationQueryDto } from '../common/dto/cursor-pagination-query.dto';
import { ApiCursorPaginated } from '../common/decorators/api-cursor-paginated.decorator';
import { ApiAppErrorResponse } from '../common/decorators/api-error-response.decorator';
import { Solution } from './entities/solution.entity';

@ApiTags('Solutions')
@Controller('v1/solutions')
export class SolutionsController {
  constructor(private readonly solutionsService: SolutionsService) {}

  @Post()
  create(@Body() body: { meshNodeId: number; content: string; authorId: string }) {
    return this.solutionsService.create(body);
  }

  /**
   * GET /v1/solutions
   * Cursor-paginated list of visible solutions, best-ranked first.
   * Returns { items, nextCursor, hasMore }.
   *
   * This endpoint is cursor-only — it never had offset params, so it takes the
   * plain CursorPaginationQueryDto rather than the deprecated variant.
   */
  @Get()
  @ApiOperation({
    summary: 'List solutions',
    description:
      'Cursor-paginated list of visible solutions, ordered by rank ascending ' +
      '(rank 1 is best), with unranked solutions last, then newest first. ' +
      'Solutions hidden by moderation are never returned.\n\n' +
      'First page: `GET /v1/solutions?limit=2`\n\n' +
      'Next page: `GET /v1/solutions?limit=2&cursor=<nextCursor from the previous response>`',
  })
  @ApiCursorPaginated({
    model: Solution,
    deprecatedPageParam: false,
    example: {
      items: [
        {
          id: '3f0c1b8e-9d2a-4c7f-8a11-5e6b0d9c4a21',
          content: 'Stagger delivery windows across the corridor.',
          status: 'active',
          rank: 1,
          score: 82,
          authorId: 'c1a4e2b7-77f5-4d3e-9b0a-2c8d1f6e4b53',
          meshNodeId: 14,
          createdAt: '2026-07-20T10:02:00.000Z',
          updatedAt: '2026-07-20T10:02:00.000Z',
        },
        {
          id: 'b9f7d3c2-1a8e-4f60-9c25-7d4a3e1b8f09',
          content: 'Introduce a shared freight consolidation hub.',
          status: 'active',
          rank: 2,
          score: 74,
          authorId: '8e2b5c91-3d47-4a06-b1f8-9c0d2e7a5b34',
          meshNodeId: 14,
          createdAt: '2026-07-20T10:01:00.000Z',
          updatedAt: '2026-07-20T10:01:00.000Z',
        },
      ],
      nextCursor:
        'eyJwIjoxLCJ2IjpbMiwiMjAyNi0wNy0yMFQxMDowMTowMC4wMDBaIl0sImkiOiJiOWY3ZDNjMi0xYThlLTRmNjAtOWMyNS03ZDRhM2UxYjhmMDkiLCJzIjoiMDRlYTJiNGQ4Y2M3In0',
      hasMore: true,
    },
  })
  @ApiAppErrorResponse(400, 'Malformed cursor, or limit outside 1..100', 'VALIDATION_FAILED')
  findAll(@Query() query: CursorPaginationQueryDto) {
    return this.solutionsService.findAll(query);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { content: string; editorId: string },
  ) {
    return this.solutionsService.update(id, body);
  }

  @Get(':id/history')
  history(@Param('id') id: string) {
    return this.solutionsService.findHistory(id);
  }

  @Post(':id/vote')
  vote(
    @Param('id') id: string,
    @Body() body: { voterId: string; value: number },
  ) {
    return this.solutionsService.vote(id, body.voterId, body.value);
  }

  @Patch(':id/rank')
  updateRank(
    @Param('id') id: string,
    @Body('rank', ParseIntPipe) rank: number,
  ) {
    return this.solutionsService.updateRank(id, rank);
  }
}
