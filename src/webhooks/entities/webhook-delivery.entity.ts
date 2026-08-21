import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum DeliveryStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
}

@Entity('webhook_deliveries')
export class WebhookDelivery {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  subscriptionId: string;

  @Column()
  eventType: string;

  @Column('jsonb')
  payload: Record<string, any>;

  @Column({ type: 'varchar', default: DeliveryStatus.PENDING })
  status: DeliveryStatus;

  @Column({ nullable: true })
  httpStatus: number;

  @Column({ nullable: true, type: 'text' })
  responseBody: string;

  @Column({ nullable: true, type: 'text' })
  errorMessage: string;

  @Column({ default: 0 })
  attempt: number;

  @CreateDateColumn()
  createdAt: Date;
}
