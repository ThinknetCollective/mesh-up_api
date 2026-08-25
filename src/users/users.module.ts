import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { RoleAuditLog } from './entities/role-audit-log.entity';
import { UsersService } from './users.service';
import { ReputationService } from './reputation.service';
import { UsersController } from './users.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RoleAuditLog]),
    forwardRef(() => AuthModule),
  ],
  providers: [UsersService, ReputationService],
  controllers: [UsersController],
  exports: [UsersService, ReputationService],
})
export class UsersModule {}
