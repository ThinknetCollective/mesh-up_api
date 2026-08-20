import { DataSource } from 'typeorm';
import { Category } from '../../category/entities/category.entity';

export const seedCategories = async (dataSource: DataSource): Promise<void> => {
  const categoryRepository = dataSource.getRepository(Category);

  const predefinedCategories = [
    { name: 'Infrastructure', icon: 'HardHat', color: '#4B5563' },
    { name: 'Healthcare', icon: 'Heart', color: '#EF4444' },
    { name: 'Education', icon: 'GraduationCap', color: '#3B82F6' },
    { name: 'Environment', icon: 'Leaf', color: '#10B981' },
    { name: 'Technology', icon: 'Cpu', color: '#8B5CF6' },
    { name: 'Governance', icon: 'Scale', color: '#F59E0B' },
    { name: 'Social', icon: 'Users', color: '#EC4899' },
    { name: 'Economic', icon: 'TrendingUp', color: '#14B8A6' },
    { name: 'Other', icon: 'HelpCircle', color: '#6B7280' },
  ];

  for (const cat of predefinedCategories) {
    const exists = await categoryRepository.findOne({ where: { name: cat.name } });
    if (!exists) {
      await categoryRepository.save(categoryRepository.create(cat));
    }
  }
};