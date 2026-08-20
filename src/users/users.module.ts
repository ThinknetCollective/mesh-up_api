import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { ReputationService } from './reputation.service';
import { UsersController } from './users.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService, ReputationService],
  controllers: [UsersController],
  exports: [UsersService, ReputationService],
})
export class UsersModule {}
