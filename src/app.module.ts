import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { WebsocketsModule } from './websockets/websockets.module';
import { ModerationModule } from './moderation/moderation.module';
import { Solution } from './solutions/entities/solution.entity';
import { SolutionRevision } from './solutions/entities/solution-revision.entity';
import { Problem } from './solutions/entities/problem.entity';
import { User } from './users/entities/user.entity';
import { Report } from './moderation/entities/report.entity';
import { UsersModule } from './users/users.module';
import { SolutionsModule } from './solutions/solutions.module';
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
      entities: [User, Solution, SolutionRevision, Problem, Report],
      synchronize: true, // For development; use migrations for production
    }),
    AuthModule,
    WebsocketsModule,
    ModerationModule,
    UsersModule,
    SolutionsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements OnModuleInit {
  constructor(private dataSource: DataSource) {}

  async onModuleInit() {
    await this.dataSource.query('CREATE EXTENSION IF NOT EXISTS vector');
  }
}