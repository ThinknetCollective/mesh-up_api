import {
  Controller,
  Get,
  Delete,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { Category } from './entities/category.entity';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

@ApiTags('Categories')
@Controller('api/v1/categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  @ApiOperation({ summary: 'List all categories' })
  @ApiQuery({
    name: 'includeDeleted',
    required: false,
    type: Boolean,
    description: 'Whether to include soft-deleted categories',
  })
  async getAllCategories(
    @Query('includeDeleted') includeDeleted?: string,
  ): Promise<Category[]> {
    const shouldInclude = includeDeleted === 'true' || includeDeleted === '1';
    return this.categoriesService.findAll(shouldInclude);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a category' })
  async delete(@Param('id') id: string, @Request() req: any): Promise<void> {
    const userId = req.user?.sub ?? req.user?.id;
    return this.categoriesService.delete(id, userId);
  }
}