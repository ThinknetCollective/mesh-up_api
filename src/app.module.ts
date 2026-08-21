import { Module, OnModuleInit, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { WebsocketsModule } from './websockets/websockets.module';
import { MeshNodesModule } from './mesh-nodes/mesh-nodes.module';
import { EmbeddingsModule } from './embeddings/embeddings.module';
import { SearchModule } from './search/search.module';
import { UnversionedRedirectMiddleware } from './common/middleware/unversioned-redirect.middleware';
import { ModerationModule } from './moderation/moderation.module';
import { CommentsModule } from './comments/comments.module';
import { Solution } from './solutions/entities/solution.entity';
import { SolutionRevision } from './solutions/entities/solution-revision.entity';
import { Problem } from './solutions/entities/problem.entity';
import { Vote } from './solutions/entities/vote.entity';
import { Comment } from './comments/entities/comment.entity';
import { User } from './users/entities/user.entity';
import { RoleAuditLog } from './users/entities/role-audit-log.entity';
import { Report } from './moderation/entities/report.entity';
import { WebhookSubscription } from './webhooks/entities/webhook-subscription.entity';
import { WebhookDelivery } from './webhooks/entities/webhook-delivery.entity';
import { UsersModule } from './users/users.module';
import { SolutionsModule } from './solutions/solutions.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { DataSource } from 'typeorm';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST || 'localhost',
      port: parseInt(process.env.DATABASE_PORT, 10) || 5432,
      username: process.env.DATABASE_USER || 'postgres',
      password: process.env.DATABASE_PASSWORD || 'postgres',
      database: process.env.DATABASE_NAME || 'mesh_api',
      entities: [User, RoleAuditLog, Solution, SolutionRevision, Problem, Vote, Comment, Report],
      synchronize: true, // For development; use migrations for production
    }),
    AuthModule,
    WebsocketsModule,
    ModerationModule,
    UsersModule,
    SolutionsModule,
    CommentsModule,
    WebhooksModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements OnModuleInit, NestModule {
  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS vector');
  }

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(UnversionedRedirectMiddleware)
      .forRoutes('*');
  }
}