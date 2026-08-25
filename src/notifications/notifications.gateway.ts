import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { WsJwtAuthGuard } from '../auth/guards/ws-jwt-auth.guard';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: 'notifications',
})
@UseGuards(WsJwtAuthGuard)
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    const user = client.data.user;
    if (user?.id) {
      // Scope client to their unique user ID room to prevent broadcast leakage
      client.join(`user_${user.id}`);
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data.user;
    if (user?.id) {
      client.leave(`user_${user.id}`);
    }
  }

  /**
   * Emits an event specifically to an authenticated user's socket channel.
   */
  sendToUser(userId: string, event: string, payload: any) {
    this.server.to(`user_${userId}`).emit(event, payload);
  }
}