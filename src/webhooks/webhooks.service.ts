import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, createHmac } from 'crypto';
import { WebhookSubscription, WebhookEventType } from './entities/webhook-subscription.entity';
import { WebhookDelivery, DeliveryStatus } from './entities/webhook-delivery.entity';
import { CreateWebhookDto } from './dto/create-webhook.dto';

const MAX_CONSECUTIVE_FAILURES = 5;

@Injectable()
export class WebhooksService {
  constructor(
    @InjectRepository(WebhookSubscription)
    private readonly subscriptionRepo: Repository<WebhookSubscription>,
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepo: Repository<WebhookDelivery>,
  ) {}

  async create(dto: CreateWebhookDto, ownerUserId: string): Promise<WebhookSubscription> {
    const secret = randomBytes(32).toString('hex');
    const subscription = this.subscriptionRepo.create({
      url: dto.url,
      eventTypes: dto.eventTypes,
      secret,
      ownerUserId,
    });
    return this.subscriptionRepo.save(subscription);
  }

  async remove(id: string, userId: string): Promise<void> {
    const subscription = await this.subscriptionRepo.findOneBy({ id });
    if (!subscription) {
      throw new NotFoundException(`Webhook subscription ${id} not found`);
    }
    if (subscription.ownerUserId !== userId) {
      throw new ForbiddenException('You can only delete your own webhook subscriptions');
    }
    await this.subscriptionRepo.delete(id);
  }

  async findByOwner(ownerUserId: string): Promise<WebhookSubscription[]> {
    return this.subscriptionRepo.find({
      where: { ownerUserId },
      order: { createdAt: 'DESC' },
    });
  }

  async findActiveByEventType(eventType: WebhookEventType): Promise<WebhookSubscription[]> {
    const all = await this.subscriptionRepo.find({
      where: { active: true },
    });
    return all.filter((sub) => sub.eventTypes.includes(eventType));
  }

  signPayload(payload: string, secret: string): string {
    return createHmac('sha256', secret).update(payload).digest('hex');
  }

  async dispatch(eventType: WebhookEventType, payload: Record<string, any>): Promise<void> {
    const subscriptions = await this.findActiveByEventType(eventType);

    for (const sub of subscriptions) {
      await this.deliverToSubscription(sub, eventType, payload);
    }
  }

  async deliverToSubscription(
    subscription: WebhookSubscription,
    eventType: string,
    payload: Record<string, any>,
  ): Promise<WebhookDelivery> {
    const body = JSON.stringify(payload);
    const signature = this.signPayload(body, subscription.secret);

    const delivery = this.deliveryRepo.create({
      subscriptionId: subscription.id,
      eventType,
      payload,
      attempt: 1,
    });

    try {
      const response = await fetch(subscription.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': `sha256=${signature}`,
          'X-Webhook-Event': eventType,
          'X-Webhook-Delivery': delivery.id || 'pending',
        },
        body,
        signal: AbortSignal.timeout(10000),
      });

      delivery.httpStatus = response.status;
      delivery.responseBody = await response.text().catch(() => '');

      if (response.ok) {
        delivery.status = DeliveryStatus.SUCCESS;
        subscription.consecutiveFailures = 0;
      } else {
        delivery.status = DeliveryStatus.FAILED;
        delivery.errorMessage = `HTTP ${response.status}`;
        subscription.consecutiveFailures += 1;
      }
    } catch (error) {
      delivery.status = DeliveryStatus.FAILED;
      delivery.errorMessage = error instanceof Error ? error.message : 'Unknown error';
      subscription.consecutiveFailures += 1;
    }

    if (subscription.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      subscription.active = false;
    }

    await this.subscriptionRepo.save(subscription);
    return this.deliveryRepo.save(delivery);
  }

  async retryDelivery(deliveryId: string): Promise<WebhookDelivery> {
    const delivery = await this.deliveryRepo.findOneBy({ id: deliveryId });
    if (!delivery) {
      throw new NotFoundException(`Delivery ${deliveryId} not found`);
    }

    const subscription = await this.subscriptionRepo.findOneBy({ id: delivery.subscriptionId });
    if (!subscription) {
      throw new NotFoundException('Associated subscription not found');
    }

    return this.deliverToSubscription(subscription, delivery.eventType, delivery.payload);
  }

  async getDeliveries(subscriptionId: string): Promise<WebhookDelivery[]> {
    return this.deliveryRepo.find({
      where: { subscriptionId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Calculate exponential backoff delay in milliseconds for retry attempts. */
  getBackoffDelay(attempt: number): number {
    return Math.min(1000 * Math.pow(2, attempt), 60000);
  }
}
