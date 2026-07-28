import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { DeprecatedOffsetPaginationQueryDto } from '../common/dto/cursor-pagination-query.dto';
import { ApiCursorPaginated } from '../common/decorators/api-cursor-paginated.decorator';
import { ApiAppErrorResponse } from '../common/decorators/api-error-response.decorator';
import { Comment } from './entities/comment.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('Comments')
@ApiBearerAuth()
@Controller('api/v1')
@UseGuards(JwtAuthGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  /**
   * POST /api/v1/solutions/:id/comments
   * Create a new comment (or reply) on a solution.
   */
  @Post('solutions/:id/comments')
  create(
    @Param('id') solutionId: string,
    @Body() dto: CreateCommentDto,
    @Request() req: any,
  ) {
    const authorId: string = req.user?.sub ?? req.user?.id;
    return this.commentsService.create(solutionId, authorId, dto);
  }

  /**
   * GET /api/v1/solutions/:id/comments
   * Retrieve a cursor-paginated page of top-level comments with their nested
   * replies. Returns { items, nextCursor, hasMore }.
   */
  @Get('solutions/:id/comments')
  @ApiOperation({
    summary: 'List comments on a solution',
    description:
      'Cursor-paginated root comments (oldest first), each with its nested ' +
      'replies eagerly loaded. Only root comments are paginated — replies ' +
      'always travel inside their root, so a new reply cannot shift the ' +
      'pagination.\n\n' +
      'First page: `GET /api/v1/solutions/{id}/comments?limit=2`\n\n' +
      'Next page: `GET /api/v1/solutions/{id}/comments?limit=2&cursor=<nextCursor>`\n\n' +
      'A cursor is scoped to one solution; replaying it on another returns 400.',
  })
  @ApiCursorPaginated({
    model: Comment,
    deprecatedPageParam: true,
    example: {
      items: [
        {
          id: '7c2e9a14-6b3d-4f81-a05c-2d9e7b1f8c46',
          content: 'Have you considered the effect on night deliveries?',
          authorId: 'c1a4e2b7-77f5-4d3e-9b0a-2c8d1f6e4b53',
          solutionId: '3f0c1b8e-9d2a-4c7f-8a11-5e6b0d9c4a21',
          depth: 0,
          createdAt: '2026-07-20T10:00:00.000Z',
          children: [
            {
              id: 'd48b0f37-5c1a-4e92-b7d6-0a3f8e2c9147',
              content: 'Good point — the model assumes daytime only.',
              authorId: '8e2b5c91-3d47-4a06-b1f8-9c0d2e7a5b34',
              solutionId: '3f0c1b8e-9d2a-4c7f-8a11-5e6b0d9c4a21',
              depth: 1,
              createdAt: '2026-07-20T10:04:00.000Z',
              children: [],
            },
          ],
        },
        {
          id: 'a15f8d62-3e7c-4b09-8f24-6c1b9a0d3e75',
          content: 'Where does the funding come from?',
          authorId: '2f9d6c03-8b15-4a7e-9d38-1e0c5b4a7f62',
          solutionId: '3f0c1b8e-9d2a-4c7f-8a11-5e6b0d9c4a21',
          depth: 0,
          createdAt: '2026-07-20T10:03:00.000Z',
          children: [],
        },
      ],
      nextCursor:
        'eyJwIjoxLCJ2IjpbIjIwMjYtMDctMjBUMTA6MDM6MDAuMDAwWiJdLCJpIjoiYTE1ZjhkNjItM2U3Yy00YjA5LThmMjQtNmMxYjlhMGQzZTc1IiwicyI6IjBlZGJlNDg4ODI0ZCJ9',
      hasMore: true,
    },
  })
  @ApiAppErrorResponse(400, 'Malformed cursor, or a cursor from another solution', 'VALIDATION_FAILED')
  @ApiAppErrorResponse(404, 'Solution not found', 'NOT_FOUND')
  findAll(
    @Param('id') solutionId: string,
    @Query() query: DeprecatedOffsetPaginationQueryDto,
  ) {
    return this.commentsService.findAll(solutionId, query);
  }

  /**
   * DELETE /api/v1/comments/:id
   * Delete a comment (owner only). Cascades to all child replies.
   */
  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id') commentId: string, @Request() req: any) {
    const requesterId: string = req.user?.sub ?? req.user?.id;
    return this.commentsService.delete(commentId, requesterId);
  }
}
