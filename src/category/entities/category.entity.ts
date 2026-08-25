import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { MeshNode } from '../../mesh-nodes/entities/mesh-node.entity';

@Entity('categories')
export class Category {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column()
  icon: string; // Storing Lucide icon string identifiers (e.g., 'Server', 'Heart')

  @Column()
  color: string; // Storing hex codes or Tailwind color configurations (e.g., '#EF4444')

  @CreateDateColumn()
  createdAt: Date;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;

  @Column({ nullable: true })
  deletedBy: string | null;

  @OneToMany(() => MeshNode, (meshNode) => meshNode.category)
  meshNodes: MeshNode[];
}