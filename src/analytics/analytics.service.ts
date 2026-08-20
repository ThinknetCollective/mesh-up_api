import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MeshNode } from '../mesh-nodes/entities/mesh-node.entity';
import { Solution } from '../solutions/entities/solution.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(MeshNode)
    private readonly meshNodeRepository: Repository<MeshNode>,
    @InjectRepository(Solution)
    private readonly solutionRepository: Repository<Solution>,
  ) {}

  async getOverview() {
    const totalProblems = await this.meshNodeRepository.count();
    const totalSolutions = await this.solutionRepository.count();
    
    // Average quality score
    const avgScoreResult = await this.solutionRepository
      .createQueryBuilder('solution')
      .select('AVG(solution.score)', 'avg')
      .getRawOne();
      
    const avgQualityScore = avgScoreResult && avgScoreResult.avg ? parseFloat(avgScoreResult.avg) : 0;

    // Active users: Distinct authors from mesh_nodes and solutions
    const activeProblemAuthors = await this.meshNodeRepository
      .createQueryBuilder('node')
      .select('node.authorId')
      .distinct(true)
      .getRawMany();
      
    const activeSolutionAuthors = await this.solutionRepository
      .createQueryBuilder('solution')
      .select('solution.authorId')
      .distinct(true)
      .getRawMany();

    const uniqueUsers = new Set([
      ...activeProblemAuthors.map(a => a.node_authorId),
      ...activeSolutionAuthors.map(a => a.solution_authorId)
    ].filter(Boolean));

    return {
      totalProblems,
      totalSolutions,
      avgQualityScore: Math.round(avgQualityScore * 10) / 10,
      activeUsers: uniqueUsers.size,
    };
  }

  async getTrends(days: number) {
    const trends = [];
    
    // Postgres specific DATE truncation
    const problemTrends = await this.meshNodeRepository
      .createQueryBuilder('node')
      .select('DATE(node.createdAt)', 'date')
      .addSelect('COUNT(*)', 'count')
      .where('node.createdAt >= CURRENT_DATE - (:days || \' days\')::interval', { days })
      .groupBy('DATE(node.createdAt)')
      .orderBy('DATE(node.createdAt)', 'ASC')
      .getRawMany();

    const solutionTrends = await this.solutionRepository
      .createQueryBuilder('solution')
      .select('DATE(solution.createdAt)', 'date')
      .addSelect('COUNT(*)', 'count')
      .where('solution.createdAt >= CURRENT_DATE - (:days || \' days\')::interval', { days })
      .groupBy('DATE(solution.createdAt)')
      .orderBy('DATE(solution.createdAt)', 'ASC')
      .getRawMany();

    // Merge dates
    const dateMap = new Map<string, any>();
    
    for (const p of problemTrends) {
      // Postgres returns dates as strings/Date objects based on driver.
      const d = p.date instanceof Date ? p.date.toISOString().split('T')[0] : p.date;
      dateMap.set(d, { date: d, problems: parseInt(p.count, 10), solutions: 0 });
    }
    
    for (const s of solutionTrends) {
      const d = s.date instanceof Date ? s.date.toISOString().split('T')[0] : s.date;
      if (dateMap.has(d)) {
        dateMap.get(d).solutions = parseInt(s.count, 10);
      } else {
        dateMap.set(d, { date: d, problems: 0, solutions: parseInt(s.count, 10) });
      }
    }

    const sortedDates = Array.from(dateMap.keys()).sort();
    return sortedDates.map(d => dateMap.get(d));
  }

  async getTopUsers(limit: number) {
    const topUsers = await this.solutionRepository
      .createQueryBuilder('solution')
      .select('solution.authorId', 'username') // Using authorId as username substitute
      .addSelect('COUNT(solution.id)', 'solutions')
      .addSelect('COALESCE(SUM(solution.score), 0)', 'reputation')
      .where('solution.authorId IS NOT NULL')
      .groupBy('solution.authorId')
      .orderBy('reputation', 'DESC')
      .addOrderBy('solutions', 'DESC')
      .limit(limit)
      .getRawMany();

    return topUsers.map(u => ({
      username: u.username,
      solutions: parseInt(u.solutions, 10),
      reputation: parseFloat(u.reputation),
    }));
  }
}
