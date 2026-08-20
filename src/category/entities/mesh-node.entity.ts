import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Category } from '../../category/entities/category.entity';

@Entity('mesh_nodes')
export class MeshNode {
  // ... Keep existing primary keys and other metadata columns

  @Column({ type: 'uuid', nullable: true })
  categoryId: string | null;

  @ManyToOne(() => Category, (category) => category.meshNodes, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'categoryId' })
  category: Category;

  // REMOVE or deprecate the old free-text field:
  // @Column()
  // category: string;
}