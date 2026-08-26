import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Category } from './entities/category.entity';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly auditService: AuditService,
  ) {}

  async findAll(includeDeleted = false): Promise<Category[]> {
    if (includeDeleted) {
      return this.categoryRepository.find({
        withDeleted: true,
        order: { name: 'ASC' },
      });
    }

    return this.categoryRepository.find({
      where: { deletedAt: null as any },
      order: { name: 'ASC' },
    });
  }

  async delete(id: string, userId?: string): Promise<void> {
    const category = await this.categoryRepository.findOne({ where: { id } });
    if (!category) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }

    category.deletedAt = new Date();
    category.deletedBy = userId || null;
    await this.categoryRepository.save(category);

    await this.auditService.log('DELETE_CATEGORY', 'category', category.id, userId);
  }
}