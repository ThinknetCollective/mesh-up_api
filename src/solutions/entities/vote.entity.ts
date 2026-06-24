import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Solution } from './solution.entity';
import { User } from '../../users/entities/user.entity';

@Entity('votes')
export class Vote {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  solutionId: string;

  @ManyToOne(() => Solution)
  @JoinColumn({ name: 'solutionId' })
  solution: Solution;

  @Column()
  voterId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'voterId' })
  voter: User;

  @Column()
  value: number; // 1 for upvote, -1 for downvote

  @CreateDateColumn()
  createdAt: Date;
}
