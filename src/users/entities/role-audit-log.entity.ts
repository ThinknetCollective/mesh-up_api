import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';
import { Role } from './user.entity';

@Entity('role_audit_logs')
export class RoleAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  targetUserId: string;

  @Column()
  changedByUserId: string;

  @Column({ type: 'varchar' })
  previousRole: Role;

  @Column({ type: 'varchar' })
  newRole: Role;

  @CreateDateColumn()
  createdAt: Date;
}
