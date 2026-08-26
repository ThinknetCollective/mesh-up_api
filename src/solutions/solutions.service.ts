import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Solution } from './entities/solution.entity';
import { SolutionRevision } from './entities/solution-revision.entity';
import { ReputationService, ReputationAction } from '../users/reputation.service';
import { AuditService } from '../audit/audit.service';
import {
  CursorPaginationQueryDto,
  DEFAULT_PAGE_SIZE,
} from '../common/dto/cursor-pagination-query.dto';
import { CursorPaginatedResponse } from '../common/interfaces/cursor-paginated-response.interface';
import { BatchSolutionActionDto } from './dto/batch-solution-action.dto';
import {
  CursorSpec,
  buildCursorPage,
  buildKeysetCondition,
  buildOrderBy,
  cursorScope,
  decodeCursor,
  fetchSize,
} from '../common/utils/cursor.util';

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Solutions hidden by moderation must never surface in the public list. */
const VISIBLE_STATUS = 'active';

/**
 * Cursor ordering for the public solutions list.
 *
 * `rank` ascends because rank 1 is the best (see the RANKED_1 reputation
 * award), and NULLS LAST puts not-yet-ranked solutions after every ranked one.
 * Ranks are assigned by hand and can collide, so createdAt breaks the tie
 * newest-first, and the id makes the ordering total.
 */
function solutionCursorSpec(): CursorSpec {
  return {
    keys: [
      { expr: 'solution.rank', type: 'number', direction: 'ASC', nulls: 'LAST' },
      {
        expr: 'solution.createdAt',
        type: 'date',
        direction: 'DESC',
        nulls: 'LAST',
        nonNullable: true,
      },
    ],
    id: { expr: 'solution.id', type: 'string', direction: 'DESC' },
    // Constant today, but keeps cursors bound to the result set they describe
    // if this list ever grows user-supplied filters.
    scope: cursorScope({ status: VISIBLE_STATUS }),
  };
}

function computeScore(content: string): number {
  const words = content.trim().split(/\s+/).length;
  return Math.min(100, Math.round((words / 50) * 100));
}

@Injectable()
export class SolutionsService {
  constructor(
    @InjectRepository(Solution)
    private readonly solutionRepo: Repository<Solution>,
    @InjectRepository(SolutionRevision)
    private readonly revisionRepo: Repository<SolutionRevision>,
    private readonly reputationService: ReputationService,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: { meshNodeId: number; content: string; authorId: string }) {
    const solution = this.solutionRepo.create({
      ...dto,
      score: computeScore(dto.content),
    });
    const savedSolution = await this.solutionRepo.save(solution);
    if (dto.authorId) {
      await this.reputationService.addPoints(dto.authorId, ReputationAction.SUBMIT_SOLUTION);
    }
    return savedSolution;
  }

  /**
   * Cursor-paginated list of visible solutions, best-ranked first.
   *
   * Returns { items, nextCursor, hasMore }; pass the previous response's
   * `nextCursor` back as `?cursor=` for the following page.
   */
  async findAll(
    query: CursorPaginationQueryDto,
  ): Promise<CursorPaginatedResponse<Solution>> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const spec = solutionCursorSpec();

    const qb = this.solutionRepo
      .createQueryBuilder('solution')
      .where('solution.status = :status', { status: VISIBLE_STATUS });

    if (query.includeDeleted) {
      qb.withDeleted();
    } else {
      qb.andWhere('solution.deletedAt IS NULL');
    }

    if (query.cursor) {
      const { sql, params } = buildKeysetCondition(
        spec,
        decodeCursor(spec, query.cursor),
      );
      qb.andWhere(sql, params);
    }

    buildOrderBy(spec).forEach((order, i) => {
      const apply = i === 0 ? qb.orderBy.bind(qb) : qb.addOrderBy.bind(qb);
      apply(order.expr, order.direction, order.nulls);
    });

    // One extra row answers hasMore without a second COUNT query.
    const rows = await qb.take(fetchSize(limit)).getMany();

    return buildCursorPage(rows, limit, spec, (solution) => ({
      // `rank` is nullable in the database even though the column type is not
      // declared optional, so normalise undefined to null for the cursor.
      values: [solution.rank ?? null, solution.createdAt],
      id: solution.id,
    }));
  }

  async batchAction(dto: BatchSolutionActionDto, user?: any) {
    if (dto.solutionIds.length > 50) {
      throw new BadRequestException('Batch size cannot exceed 50 items');
    }

    const results = [] as Array<{ id: string; success: boolean; error?: string }>;

    for (const solutionId of dto.solutionIds) {
      try {
        const solution = await this.solutionRepo.findOneBy({ id: solutionId });
        if (!solution) {
          results.push({ id: solutionId, success: false, error: 'Not found' });
          continue;
        }

        const canPerform = this.canPerformAction(dto.action, solution, user);
        if (!canPerform) {
          results.push({ id: solutionId, success: false, error: 'Not authorized' });
          continue;
        }

        const userId = user?.id ?? user?.sub ?? null;

        switch (dto.action) {
          case 'delete':
            solution.deletedAt = new Date();
            solution.deletedBy = userId;
            await this.solutionRepo.save(solution);
            await this.auditService.log('DELETE_SOLUTION', 'solution', solution.id, userId);
            break;
          case 'bookmark':
            solution.isBookmarked = true;
            solution.bookmarkedBy = userId;
            await this.solutionRepo.save(solution);
            break;
          case 'update-status':
            solution.status = dto.status ?? 'active';
            await this.solutionRepo.save(solution);
            break;
          default:
            results.push({ id: solutionId, success: false, error: 'Unsupported action' });
            continue;
        }

        results.push({ id: solutionId, success: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        results.push({ id: solutionId, success: false, error: message });
      }
    }

    return { results };
  }

  private canPerformAction(action: BatchSolutionActionDto['action'], solution: Solution, user?: any) {
    if (action === 'bookmark') {
      return Boolean(user?.id);
    }

    if (action === 'delete' || action === 'update-status') {
      const role = user?.role?.toLowerCase();
      return role === 'moderator' || role === 'admin';
    }

    return false;
  }

  async update(id: string, dto: { content: string; editorId: string }) {
    const solution = await this.solutionRepo.findOneBy({ id });
    if (!solution) throw new NotFoundException('Solution not found');

    const age = Date.now() - solution.createdAt.getTime();
    if (age > EDIT_WINDOW_MS) {
      throw new BadRequestException('Edit window of 24 hours has expired');
    }

    // Store revision of current state before updating
    await this.revisionRepo.save(
      this.revisionRepo.create({
        solutionId: solution.id,
        content: solution.content,
        editedBy: dto.editorId,
        previousScore: solution.score,
      }),
    );

    solution.content = dto.content;
    solution.score = computeScore(dto.content);
    return this.solutionRepo.save(solution);
  }

  async findHistory(id: string) {
    const exists = await this.solutionRepo.existsBy({ id });
    if (!exists) throw new NotFoundException('Solution not found');

    return this.revisionRepo.find({
      where: { solutionId: id },
      order: { editedAt: 'DESC' },
    });
  }

  async vote(solutionId: string, voterId: string, value: number) {
    const solution = await this.solutionRepo.findOneBy({ id: solutionId });
    if (!solution) throw new NotFoundException('Solution not found');

    if (solution.authorId) {
      const action = value > 0 ? ReputationAction.RECEIVE_UPVOTE : ReputationAction.RECEIVE_DOWNVOTE;
      await this.reputationService.addPoints(solution.authorId, action);
    }

    return { success: true };
  }

  async updateRank(id: string, rank: number) {
    const solution = await this.solutionRepo.findOneBy({ id });
    if (!solution) throw new NotFoundException('Solution not found');

    solution.rank = rank;
    await this.solutionRepo.save(solution);

    if (solution.authorId) {
      if (rank === 1) {
        await this.reputationService.addPoints(solution.authorId, ReputationAction.RANKED_1);
      } else if (rank >= 2 && rank <= 3) {
        await this.reputationService.addPoints(solution.authorId, ReputationAction.RANKED_2_3);
      }
    }

    return solution;
  }
}
