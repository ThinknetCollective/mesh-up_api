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
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

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
   * Retrieve paginated top-level comments with their nested replies.
   */
  @Get('solutions/:id/comments')
  findAll(@Param('id') solutionId: string, @Query() query: PaginationQueryDto) {
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
