import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

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

  @Column({ nullable: true })
  authorId: string;

  @Column({ nullable: true })
  rank: number;

  @Column({ default: 0 })
  score: number;

  @Column({ nullable: true })
  meshNodeId: number;
}
