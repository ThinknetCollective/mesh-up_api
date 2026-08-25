import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

@Entity('solutions')
export class Solution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  content: string;

  @Column({ default: 'active' })
  status: string; // 'active' or 'hidden'

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;

  @Column({ nullable: true })
  deletedBy: string | null;

  @Column({ nullable: true })
  authorId: string;

  @Column({ nullable: true })
  rank: number;

  @Column({ default: 0 })
  score: number;

  @Column({ nullable: true })
  meshNodeId: number;

  @Column({ default: false })
  isBookmarked: boolean;

  @Column({ nullable: true })
  bookmarkedBy: string;
}
