import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectQueue('email-dispatch') private readonly emailQueue: Queue,
  ) {}

  async queueNotification(
    recipientEmail: string,
    recipientName: string,
    eventType: 'onComment' | 'onRanked' | 'onNewSolution' | 'weeklyDigest',
    templateData: Record<string, any>,
  ) {
    // Structural metadata verification settings for execution payloads
    await this.emailQueue.add(
      'send-event-email',
      { recipientEmail, recipientName, eventType, templateData },
      { attempts: 3, backoff: 5000, removeOnComplete: true },
    );
  }

  async findUndeliveredForUser(userId: string) {
    return [];
  }
}