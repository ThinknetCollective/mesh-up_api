import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

export enum ReputationAction {
  SUBMIT_PROBLEM = 'SUBMIT_PROBLEM',
  SUBMIT_SOLUTION = 'SUBMIT_SOLUTION',
  RANKED_1 = 'RANKED_1',
  RANKED_2_3 = 'RANKED_2_3',
  RECEIVE_UPVOTE = 'RECEIVE_UPVOTE',
  RECEIVE_DOWNVOTE = 'RECEIVE_DOWNVOTE',
}

const REPUTATION_POINTS = {
  [ReputationAction.SUBMIT_PROBLEM]: 5,
  [ReputationAction.SUBMIT_SOLUTION]: 10,
  [ReputationAction.RANKED_1]: 50,
  [ReputationAction.RANKED_2_3]: 25,
  [ReputationAction.RECEIVE_UPVOTE]: 2,
  [ReputationAction.RECEIVE_DOWNVOTE]: -1,
};

const DAILY_MAX_POINTS = 100;

@Injectable()
export class ReputationService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async addPoints(userId: string, action: ReputationAction) {
    const user = await this.userRepo.findOneBy({ id: userId as any }); // Assuming id is uuid/string
    if (!user) return;

    const now = new Date();
    const isNewDay = !user.lastPointReset || 
      now.toDateString() !== user.lastPointReset.toDateString();

    if (isNewDay) {
      user.pointsGainedToday = 0;
      user.lastPointReset = now;
    }

    let pointsToAdd = REPUTATION_POINTS[action];
    
    // Only positive points are capped
    if (pointsToAdd > 0) {
      const remainingToday = DAILY_MAX_POINTS - user.pointsGainedToday;
      pointsToAdd = Math.min(pointsToAdd, Math.max(0, remainingToday));
    }

    if (pointsToAdd !== 0) {
      user.reputation += pointsToAdd;
      if (pointsToAdd > 0) {
        user.pointsGainedToday += pointsToAdd;
      }
      await this.userRepo.save(user);
    }

    return user.reputation;
  }
}
