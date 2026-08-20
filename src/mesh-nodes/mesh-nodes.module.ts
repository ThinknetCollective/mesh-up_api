import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MeshNodesService } from './mesh-nodes.service';
import { MeshNodesController } from './mesh-nodes.controller';
import { MeshNode } from './entities/mesh-node.entity';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MeshNode]),
    UsersModule,
  ],
  providers: [MeshNodesService],
  controllers: [MeshNodesController],
  exports: [MeshNodesService],
})
export class MeshNodesModule {}
