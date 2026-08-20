import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-yet';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { MeshNode } from '../mesh-nodes/entities/mesh-node.entity';
import { Solution } from '../solutions/entities/solution.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([MeshNode, Solution]),
    CacheModule.registerAsync({
      useFactory: async () => ({
        store: await redisStore({
          socket: {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT, 10) || 6379,
          },
        }),
      }),
    }),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
