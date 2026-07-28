import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { SearchQueryDto } from './dto/search.dto';
import { MeshNode } from '../mesh-nodes/entities/mesh-node.entity';
import { ApiCursorPaginated } from '../common/decorators/api-cursor-paginated.decorator';
import { ApiAppErrorResponse } from '../common/decorators/api-error-response.decorator';

@ApiTags('Search')
@Controller('v1/search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({
    summary: 'Search mesh nodes',
    description:
      'Cursor-paginated full-text search. With `q`, results are ordered by ' +
      'relevance descending, then newest first; without it, by recency. Each ' +
      'item carries a `relevanceScore`, null when no search term was given.\n\n' +
      'First page: `GET /v1/search?q=traffic&limit=2`\n\n' +
      'Next page: `GET /v1/search?q=traffic&limit=2&cursor=<nextCursor>`\n\n' +
      'The cursor embeds a fingerprint of `q` and every filter. Changing any ' +
      'of them invalidates the cursor with a 400 — restart from the first ' +
      'page rather than reusing it, since its stored relevance value ' +
      'describes a different ranking.',
  })
  @ApiCursorPaginated({
    model: MeshNode,
    deprecatedPageParam: true,
    description:
      'A page of search hits, ordered by relevance when `q` is present.',
    example: {
      items: [
        {
          id: 142,
          title: 'Traffic congestion on the eastern corridor',
          description: 'Peak-hour traffic backs up for several kilometres.',
          authorId: 'c1a4e2b7-77f5-4d3e-9b0a-2c8d1f6e4b53',
          createdAt: '2026-07-20T10:02:00.000Z',
          updatedAt: '2026-07-20T10:02:00.000Z',
          relevanceScore: 0.0607927,
        },
        {
          id: 87,
          title: 'Freight traffic scheduling',
          description: 'Deliveries cluster into the same two-hour window.',
          authorId: '8e2b5c91-3d47-4a06-b1f8-9c0d2e7a5b34',
          createdAt: '2026-07-20T10:01:00.000Z',
          updatedAt: '2026-07-20T10:01:00.000Z',
          relevanceScore: 0.0303964,
        },
      ],
      nextCursor:
        'eyJwIjoxLCJ2IjpbMC4wMzAzOTY0LCIyMDI2LTA3LTIwVDEwOjAxOjAwLjAwMFoiXSwiaSI6ODcsInMiOiI1MDFhMGQyZDZiYTIifQ',
      hasMore: true,
    },
  })
  @ApiAppErrorResponse(
    400,
    'Malformed cursor, or a cursor issued for a different search term or filter set',
    'VALIDATION_FAILED',
  )
  search(@Query() query: SearchQueryDto) {
    return this.searchService.search(query);
  }
}
