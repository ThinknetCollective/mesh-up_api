import { IsUrl, IsArray, IsEnum, ArrayMinSize } from 'class-validator';
import { WebhookEventType } from '../entities/webhook-subscription.entity';

export class CreateWebhookDto {
  @IsUrl({}, { message: 'url must be a valid URL' })
  url: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one event type is required' })
  @IsEnum(WebhookEventType, {
    each: true,
    message: `Each event type must be one of: ${Object.values(WebhookEventType).join(', ')}`,
  })
  eventTypes: WebhookEventType[];
}
