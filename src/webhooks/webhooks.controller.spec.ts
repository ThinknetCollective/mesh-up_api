import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { AuthService } from '../auth/auth.service';
import { WebhookEventType } from './entities/webhook-subscription.entity';

describe('WebhooksController', () => {
  let controller: WebhooksController;
  let webhooksService: {
    create: jest.Mock;
    remove: jest.Mock;
    findByOwner: jest.Mock;
    getDeliveries: jest.Mock;
  };

  beforeEach(async () => {
    webhooksService = {
      create: jest.fn(),
      remove: jest.fn(),
      findByOwner: jest.fn(),
      getDeliveries: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [WebhooksController],
      providers: [
        { provide: WebhooksService, useValue: webhooksService },
        { provide: AuthService, useValue: { validateToken: jest.fn() } },
      ],
    }).compile();

    controller = module.get(WebhooksController);
  });

  describe('create', () => {
    it('creates a webhook subscription for the authenticated user', async () => {
      const dto = {
        url: 'https://example.com/hook',
        eventTypes: [WebhookEventType.SOLUTION_RANKED_TOP],
      };
      const expected = { id: 'sub-1', ...dto, ownerUserId: 'user-1' };
      webhooksService.create.mockResolvedValue(expected);

      const req = { user: { sub: 'user-1' } };
      const result = await controller.create(dto, req);

      expect(result).toEqual(expected);
      expect(webhooksService.create).toHaveBeenCalledWith(dto, 'user-1');
    });
  });

  describe('remove', () => {
    it('removes a webhook subscription for the authenticated user', async () => {
      webhooksService.remove.mockResolvedValue(undefined);

      const req = { user: { sub: 'user-1' } };
      await controller.remove('sub-1', req);

      expect(webhooksService.remove).toHaveBeenCalledWith('sub-1', 'user-1');
    });
  });

  describe('findMine', () => {
    it('returns subscriptions owned by the authenticated user', async () => {
      const subs = [{ id: 'sub-1', ownerUserId: 'user-1' }];
      webhooksService.findByOwner.mockResolvedValue(subs);

      const req = { user: { sub: 'user-1' } };
      const result = await controller.findMine(req);

      expect(result).toEqual(subs);
      expect(webhooksService.findByOwner).toHaveBeenCalledWith('user-1');
    });
  });

  describe('getDeliveries', () => {
    it('returns delivery logs for a subscription', async () => {
      const deliveries = [{ id: 'del-1', status: 'success' }];
      webhooksService.getDeliveries.mockResolvedValue(deliveries);

      const result = await controller.getDeliveries('sub-1');

      expect(result).toEqual(deliveries);
      expect(webhooksService.getDeliveries).toHaveBeenCalledWith('sub-1');
    });
  });
});
