import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

export class UserEmailPreferences {
  @Column({ default: true })
  onComment: boolean;

  @Column({ default: true })
  onRanked: boolean;

  @Column({ default: true })
  onNewSolution: boolean;

  @Column({ default: true })
  weeklyDigest: boolean;
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column(() => UserEmailPreferences)
  emailPreferences: UserEmailPreferences;

  @Column({ default: 0 })
  reputation: number;

  @Column({ default: 0 })
  pointsGainedToday: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  lastPointReset: Date;
}