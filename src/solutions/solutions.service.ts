import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Solution } from './entities/solution.entity';
import { SolutionRevision } from './entities/solution-revision.entity';
import { ReputationService, ReputationAction } from '../users/reputation.service';
import {
  CursorPaginationQueryDto,
  DEFAULT_PAGE_SIZE,
} from '../common/dto/cursor-pagination-query.dto';
import { CursorPaginatedResponse } from '../common/interfaces/cursor-paginated-response.interface';
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
