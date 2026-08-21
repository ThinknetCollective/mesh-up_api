import {
  Controller,
  Post,
  Delete,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller(['v1/webhooks', 'api/v1/webhooks'])
@UseGuards(JwtAuthGuard)
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
  create(@Body() dto: CreateWebhookDto, @Request() req: any) {
    const userId = req.user?.sub || req.user?.id;
    return this.webhooksService.create(dto, userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.sub || req.user?.id;
    return this.webhooksService.remove(id, userId);
  }

  @Get()
  findMine(@Request() req: any) {
    const userId = req.user?.sub || req.user?.id;
    return this.webhooksService.findByOwner(userId);
  }

  @Get(':id/deliveries')
  getDeliveries(@Param('id') id: string) {
    return this.webhooksService.getDeliveries(id);
  }
}
