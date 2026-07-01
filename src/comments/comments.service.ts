import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, TreeRepository } from 'typeorm';
import { Comment } from './entities/comment.entity';
import { Solution } from '../solutions/entities/solution.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { PaginationQueryDto } from './dto/pagination-query.dto';

/** Maximum nesting depth allowed for replies (0-indexed). */
const MAX_DEPTH = 2; // root=0, reply=1, reply-of-reply=2

/** Maximum number of comments an author may post per hour. */
const RATE_LIMIT_PER_HOUR = 10;

/** Length of the rate-limit sliding window in milliseconds. */
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepo: TreeRepository<Comment>,
    @InjectRepository(Solution)
    private readonly solutionRepo: Repository<Solution>,
  ) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Post a new comment (or reply) on a solution.
   * Enforces max-depth of 3 levels and a rate-limit of 10 comments per hour.
   */
  async create(
    solutionId: string,
    authorId: string,
    dto: CreateCommentDto,
  ): Promise<Comment> {
    // Verify the solution exists
    const solution = await this.solutionRepo.findOne({ where: { id: solutionId } });
    if (!solution) {
      throw new NotFoundException(`Solution with ID ${solutionId} not found`);
    }

    // Enforce per-user rate limit
    await this.assertRateLimit(authorId);

    let parent: Comment | null = null;
    let depth = 0;

    if (dto.parentId) {
      parent = await this.commentRepo.findOne({ where: { id: dto.parentId } });
      if (!parent) {
        throw new NotFoundException(`Parent comment with ID ${dto.parentId} not found`);
      }
      // Only allow replies to comments on the same solution
      if (parent.solutionId !== solutionId) {
        throw new BadRequestException('Parent comment does not belong to this solution');
      }
      depth = parent.depth + 1;
      if (depth > MAX_DEPTH) {
        throw new BadRequestException(
          `Maximum reply depth of ${MAX_DEPTH + 1} levels reached`,
        );
      }
    }

    const comment = this.commentRepo.create({
      content: dto.content,
      authorId,
      solutionId,
      depth,
      parent,
    });

    return this.commentRepo.save(comment);
  }

  /**
   * Retrieve paginated top-level comments for a solution, each with their
   * nested children (replies) eagerly loaded via the closure table.
   */
  async findAll(
    solutionId: string,
    query: PaginationQueryDto,
  ): Promise<{ data: Comment[]; total: number; page: number; limit: number }> {
    const solution = await this.solutionRepo.findOne({ where: { id: solutionId } });
    if (!solution) {
      throw new NotFoundException(`Solution with ID ${solutionId} not found`);
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    // Fetch only root-level comments (depth=0) for pagination
    const [rootComments, total] = await this.commentRepo.findAndCount({
      where: { solutionId, depth: 0 },
      order: { createdAt: 'ASC' },
      skip,
      take: limit,
    });

    // Load the full subtree for each root comment
    const data = await Promise.all(
      rootComments.map((root) => this.commentRepo.findDescendantsTree(root)),
    );

    return { data, total, page, limit };
  }

  /**
   * Delete a comment by its owner. Cascades to all descendant replies due to
   * the CASCADE delete on the closure-table and tree-parent relations.
   */
  async delete(commentId: string, requesterId: string): Promise<void> {
    const comment = await this.commentRepo.findOne({ where: { id: commentId } });
    if (!comment) {
      throw new NotFoundException(`Comment with ID ${commentId} not found`);
    }
    if (comment.authorId !== requesterId) {
      throw new ForbiddenException('You can only delete your own comments');
    }
    await this.commentRepo.remove(comment);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Throws TooManyRequestsException when the author has already posted
   * RATE_LIMIT_PER_HOUR comments within the last rolling hour.
   */
  private async assertRateLimit(authorId: string): Promise<void> {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);

    const recentCount = await this.commentRepo
      .createQueryBuilder('comment')
      .where('comment.authorId = :authorId', { authorId })
      .andWhere('comment.createdAt >= :since', { since })
      .getCount();

    if (recentCount >= RATE_LIMIT_PER_HOUR) {
      throw new BadRequestException(
        `Rate limit exceeded: you may post at most ${RATE_LIMIT_PER_HOUR} comments per hour`,
      );
    }
  }
}
