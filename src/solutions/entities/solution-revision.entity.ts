import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Solution } from './solution.entity';

@Entity('solution_revisions')
export class SolutionRevision {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('uuid')
  solutionId: string;

  @ManyToOne(() => Solution)
  @JoinColumn({ name: 'solutionId' })
  solution: Solution;

  @Column('text')
  content: string;

  @Column()
  editedBy: string;

  @Column({ type: 'decimal', nullable: true })
  previousScore: number;

  @CreateDateColumn()
  editedAt: Date;
}
