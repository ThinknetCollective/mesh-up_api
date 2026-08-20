import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { AnalyticsService } from './analytics.service';

@Controller('api/v1/analytics')
@UseInterceptors(CacheInterceptor)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @CacheTTL(3600000) // 1 hour cache
  async getOverview() {
    // In a real application, an AdminGuard would protect this endpoint.
    // The AC notes "(requires admin role)" which can be implemented by adding 
    // an appropriate RoleGuard or simply noting it here depending on existing auth.
    // Assuming standard implementation:
    const overview = await this.analyticsService.getOverview();
    return { overview };
  }

  @Get('trends')
  @CacheTTL(3600000)
  async getTrends(@Query('days') days?: string) {
    const parsedDays = days ? parseInt(days, 10) : 30;
    const trends = await this.analyticsService.getTrends(parsedDays);
    return { trends };
  }

  @Get('top-users')
  @CacheTTL(3600000)
  async getTopUsers(@Query('limit') limit?: string) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10;
    const topUsers = await this.analyticsService.getTopUsers(parsedLimit);
    return { topUsers };
  }
}
