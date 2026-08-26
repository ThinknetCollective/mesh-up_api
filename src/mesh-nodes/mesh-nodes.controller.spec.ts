import { Test, TestingModule } from '@nestjs/testing';
import { MeshNodesController } from './mesh-nodes.controller';
import { MeshNodesService } from './mesh-nodes.service';

describe('MeshNodesController', () => {
  let controller: MeshNodesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MeshNodesController],
      providers: [
        {
          provide: MeshNodesService,
          useValue: {
            create: jest.fn(),
            findSimilar: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<MeshNodesController>(MeshNodesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
