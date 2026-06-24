import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Solution } from './entities/solution.entity';
import { SolutionRevision } from './entities/solution-revision.entity';
import { ReputationService, ReputationAction } from '../users/reputation.service';

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

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

  async update(id: number, dto: { content: string; editorId: string }) {
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

  async findHistory(id: number) {
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
    const solution = await this.solutionRepo.findOneBy({ id: id as any });
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
