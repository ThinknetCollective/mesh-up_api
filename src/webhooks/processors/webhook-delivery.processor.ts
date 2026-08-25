import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bull';
import { WebhooksService } from '../webhooks.service';

export interface WebhookDeliveryJobData {
  subscriptionId: string;
  eventType: string;
  payload: Record<string, any>;
}

@Processor('webhook-delivery')
export class WebhookDeliveryProcessor {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Process()
  async handleDelivery(job: Job<WebhookDeliveryJobData>) {
    const { subscriptionId, eventType, payload } = job.data;

    const { WebhookSubscription } = await import('../entities/webhook-subscription.entity');
    const subscription = await this.webhooksService['subscriptionRepo'].findOneBy({
      id: subscriptionId,
    });

    if (!subscription || !subscription.active) {
      return;
    }

    await this.webhooksService.deliverToSubscription(subscription, eventType, payload);
  }
}
