import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum WebhookEventType {
  SOLUTION_RANKED_TOP = 'solution.ranked_top',
  SOLUTION_DUPLICATE_DETECTED = 'solution.duplicate_detected',
  PROBLEM_RESOLVED = 'problem.resolved',
}

@Entity('webhook_subscriptions')
export class WebhookSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  url: string;

  @Column('simple-array')
  eventTypes: WebhookEventType[];

  @Column()
  secret: string;

  @Column()
  ownerUserId: string;

  @Column({ default: true })
  active: boolean;

  @Column({ default: 0 })
  consecutiveFailures: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
