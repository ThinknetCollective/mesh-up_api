import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  action: string; // e.g. 'DELETE_SOLUTION', 'DELETE_COMMENT', 'DELETE_CATEGORY', 'PURGE_RECORDS', 'UPDATE_ROLE', 'MODERATION'

  @Column()
  entityType: string; // e.g. 'solution', 'comment', 'category'

  @Column()
  entityId: string;

  @Column({ nullable: true })
  userId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn()
  createdAt: Date;
}
