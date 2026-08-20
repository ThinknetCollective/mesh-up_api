import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Tree,
  TreeChildren,
  TreeParent,
} from 'typeorm';
import { Solution } from '../../solutions/entities/solution.entity';

/**
 * Comment entity supporting nested replies up to 3 levels deep.
 * Uses TypeORM closure-table tree strategy for efficient ancestor/descendant queries.
 */
@Entity('comments')
@Tree('closure-table')
export class Comment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  content: string;

  /** ID of the user who authored the comment */
  @Column()
  authorId: string;

  /** The solution this comment belongs to */
  @Column()
  solutionId: string;

  @ManyToOne(() => Solution, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'solutionId' })
  solution: Solution;

  /** Nesting depth: root comments are depth 0, first replies are depth 1, etc. */
  @Column({ default: 0 })
  depth: number;

  @TreeParent({ onDelete: 'CASCADE' })
  parent: Comment | null;

  @TreeChildren()
  children: Comment[];

  @CreateDateColumn()
  createdAt: Date;
}
