import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findOne(id: string): Promise<User> {
    const user = await this.userRepo.findOneBy({ id });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  getBadge(reputation: number): string {
    if (reputation >= 1000) return 'Gold';
    if (reputation >= 500) return 'Silver';
    if (reputation >= 100) return 'Bronze';
    return 'None';
  }

  async getReputation(id: string) {
    const user = await this.findOne(id);
    return {
      reputation: user.reputation,
      badge: this.getBadge(user.reputation),
    };
  }
}
