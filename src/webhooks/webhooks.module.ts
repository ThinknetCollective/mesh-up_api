import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { WebhookSubscription } from './entities/webhook-subscription.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { WebhookDeliveryProcessor } from './processors/webhook-delivery.processor';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookSubscription, WebhookDelivery]),
    BullModule.registerQueue({ name: 'webhook-delivery' }),
    AuthModule,
  ],
  providers: [WebhooksService, WebhookDeliveryProcessor],
  controllers: [WebhooksController],
  exports: [WebhooksService],
})
export class WebhooksModule {}
