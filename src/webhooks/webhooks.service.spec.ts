import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { WebhookSubscription, WebhookEventType } from './entities/webhook-subscription.entity';
import { WebhookDelivery, DeliveryStatus } from './entities/webhook-delivery.entity';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let subscriptionRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOneBy: jest.Mock;
    find: jest.Mock;
    delete: jest.Mock;
  };
  let deliveryRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOneBy: jest.Mock;
    find: jest.Mock;
  };

  beforeEach(async () => {
    subscriptionRepo = {
      create: jest.fn((dto) => ({ id: 'sub-1', ...dto })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      findOneBy: jest.fn(),
      find: jest.fn(),
      delete: jest.fn(),
    };
    deliveryRepo = {
      create: jest.fn((dto) => ({ id: 'del-1', ...dto })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      findOneBy: jest.fn(),
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: getRepositoryToken(WebhookSubscription), useValue: subscriptionRepo },
        { provide: getRepositoryToken(WebhookDelivery), useValue: deliveryRepo },
      ],
    }).compile();

    service = module.get(WebhooksService);
  });

  describe('create', () => {
    it('creates a subscription with a generated secret', async () => {
      const dto = {
        url: 'https://example.com/hook',
        eventTypes: [WebhookEventType.SOLUTION_RANKED_TOP],
      };

      const result = await service.create(dto, 'user-1');

      expect(subscriptionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com/hook',
          eventTypes: [WebhookEventType.SOLUTION_RANKED_TOP],
          ownerUserId: 'user-1',
          secret: expect.any(String),
        }),
      );
      expect(result.secret).toBeDefined();
      expect(result.secret.length).toBe(64); // 32 bytes hex
    });
  });

  describe('remove', () => {
    it('deletes a subscription owned by the user', async () => {
      subscriptionRepo.findOneBy.mockResolvedValue({
        id: 'sub-1',
        ownerUserId: 'user-1',
      });

      await service.remove('sub-1', 'user-1');

      expect(subscriptionRepo.delete).toHaveBeenCalledWith('sub-1');
    });

    it('throws NotFoundException when subscription does not exist', async () => {
      subscriptionRepo.findOneBy.mockResolvedValue(null);

      await expect(service.remove('missing', 'user-1')).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user does not own the subscription', async () => {
      subscriptionRepo.findOneBy.mockResolvedValue({
        id: 'sub-1',
        ownerUserId: 'other-user',
      });

      await expect(service.remove('sub-1', 'user-1')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findByOwner', () => {
    it('returns subscriptions for the given owner', async () => {
      const subs = [{ id: 'sub-1', ownerUserId: 'user-1' }];
      subscriptionRepo.find.mockResolvedValue(subs);

      const result = await service.findByOwner('user-1');

      expect(subscriptionRepo.find).toHaveBeenCalledWith({
        where: { ownerUserId: 'user-1' },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(subs);
    });
  });

  describe('findActiveByEventType', () => {
    it('returns only active subscriptions matching the event type', async () => {
      subscriptionRepo.find.mockResolvedValue([
        {
          id: 'sub-1',
          active: true,
          eventTypes: [WebhookEventType.SOLUTION_RANKED_TOP],
        },
        {
          id: 'sub-2',
          active: true,
          eventTypes: [WebhookEventType.PROBLEM_RESOLVED],
        },
      ]);

      const result = await service.findActiveByEventType(WebhookEventType.SOLUTION_RANKED_TOP);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('sub-1');
    });
  });

  describe('signPayload', () => {
    it('generates a consistent HMAC-SHA256 signature', () => {
      const payload = '{"event":"test"}';
      const secret = 'test-secret';

      const sig1 = service.signPayload(payload, secret);
      const sig2 = service.signPayload(payload, secret);

      expect(sig1).toBe(sig2);
      expect(sig1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('produces different signatures for different secrets', () => {
      const payload = '{"event":"test"}';

      const sig1 = service.signPayload(payload, 'secret-1');
      const sig2 = service.signPayload(payload, 'secret-2');

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('deliverToSubscription', () => {
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('records a successful delivery and resets failure count', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('OK'),
      }) as any;

      const sub = {
        id: 'sub-1',
        url: 'https://example.com/hook',
        secret: 'test-secret',
        consecutiveFailures: 2,
        active: true,
        eventTypes: [WebhookEventType.SOLUTION_RANKED_TOP],
      } as WebhookSubscription;

      const delivery = await service.deliverToSubscription(
        sub,
        WebhookEventType.SOLUTION_RANKED_TOP,
        { solutionId: 's-1' },
      );

      expect(delivery.status).toBe(DeliveryStatus.SUCCESS);
      expect(delivery.httpStatus).toBe(200);
      expect(sub.consecutiveFailures).toBe(0);
    });

    it('increments failure count on non-OK response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      }) as any;

      const sub = {
        id: 'sub-1',
        url: 'https://example.com/hook',
        secret: 'test-secret',
        consecutiveFailures: 0,
        active: true,
        eventTypes: [WebhookEventType.SOLUTION_RANKED_TOP],
      } as WebhookSubscription;

      const delivery = await service.deliverToSubscription(
        sub,
        WebhookEventType.SOLUTION_RANKED_TOP,
        { solutionId: 's-1' },
      );

      expect(delivery.status).toBe(DeliveryStatus.FAILED);
      expect(sub.consecutiveFailures).toBe(1);
      expect(sub.active).toBe(true);
    });

    it('increments failure count on network error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;

      const sub = {
        id: 'sub-1',
        url: 'https://example.com/hook',
        secret: 'test-secret',
        consecutiveFailures: 3,
        active: true,
        eventTypes: [WebhookEventType.SOLUTION_RANKED_TOP],
      } as WebhookSubscription;

      const delivery = await service.deliverToSubscription(
        sub,
        WebhookEventType.SOLUTION_RANKED_TOP,
        { solutionId: 's-1' },
      );

      expect(delivery.status).toBe(DeliveryStatus.FAILED);
      expect(delivery.errorMessage).toBe('ECONNREFUSED');
      expect(sub.consecutiveFailures).toBe(4);
    });

    it('disables subscription after 5 consecutive failures', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as any;

      const sub = {
        id: 'sub-1',
        url: 'https://example.com/hook',
        secret: 'test-secret',
        consecutiveFailures: 4,
        active: true,
        eventTypes: [WebhookEventType.SOLUTION_RANKED_TOP],
      } as WebhookSubscription;

      await service.deliverToSubscription(
        sub,
        WebhookEventType.SOLUTION_RANKED_TOP,
        { solutionId: 's-1' },
      );

      expect(sub.consecutiveFailures).toBe(5);
      expect(sub.active).toBe(false);
      expect(subscriptionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ active: false }),
      );
    });

    it('sends HMAC signature in X-Webhook-Signature header', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('OK'),
      });
      global.fetch = fetchMock as any;

      const sub = {
        id: 'sub-1',
        url: 'https://example.com/hook',
        secret: 'my-secret',
        consecutiveFailures: 0,
        active: true,
        eventTypes: [WebhookEventType.SOLUTION_RANKED_TOP],
      } as WebhookSubscription;

      const payload = { solutionId: 's-1' };
      await service.deliverToSubscription(
        sub,
        WebhookEventType.SOLUTION_RANKED_TOP,
        payload,
      );

      const callArgs = fetchMock.mock.calls[0];
      const headers = callArgs[1].headers;

      expect(headers['X-Webhook-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
      expect(headers['X-Webhook-Event']).toBe(WebhookEventType.SOLUTION_RANKED_TOP);

      // Verify the signature is correct
      const expectedSig = service.signPayload(JSON.stringify(payload), 'my-secret');
      expect(headers['X-Webhook-Signature']).toBe(`sha256=${expectedSig}`);
    });
  });

  describe('dispatch', () => {
    let originalFetch: typeof global.fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('OK'),
      }) as any;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('delivers to all active subscriptions matching the event type', async () => {
      subscriptionRepo.find.mockResolvedValue([
        {
          id: 'sub-1',
          url: 'https://a.com/hook',
          secret: 's1',
          consecutiveFailures: 0,
          active: true,
          eventTypes: [WebhookEventType.SOLUTION_RANKED_TOP],
        },
        {
          id: 'sub-2',
          url: 'https://b.com/hook',
          secret: 's2',
          consecutiveFailures: 0,
          active: true,
          eventTypes: [WebhookEventType.SOLUTION_RANKED_TOP],
        },
      ]);

      await service.dispatch(WebhookEventType.SOLUTION_RANKED_TOP, { solutionId: 's-1' });

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getDeliveries', () => {
    it('returns deliveries for a subscription ordered by createdAt DESC', async () => {
      const deliveries = [{ id: 'del-1', status: DeliveryStatus.SUCCESS }];
      deliveryRepo.find.mockResolvedValue(deliveries);

      const result = await service.getDeliveries('sub-1');

      expect(deliveryRepo.find).toHaveBeenCalledWith({
        where: { subscriptionId: 'sub-1' },
        order: { createdAt: 'DESC' },
      });
      expect(result).toEqual(deliveries);
    });
  });

  describe('getBackoffDelay', () => {
    it('returns exponential backoff with a 60s cap', () => {
      expect(service.getBackoffDelay(0)).toBe(1000);
      expect(service.getBackoffDelay(1)).toBe(2000);
      expect(service.getBackoffDelay(2)).toBe(4000);
      expect(service.getBackoffDelay(3)).toBe(8000);
      expect(service.getBackoffDelay(4)).toBe(16000);
      expect(service.getBackoffDelay(5)).toBe(32000);
      expect(service.getBackoffDelay(6)).toBe(60000);
      expect(service.getBackoffDelay(10)).toBe(60000);
    });
  });
});
