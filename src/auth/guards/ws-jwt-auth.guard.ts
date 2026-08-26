import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { AuthService } from '../auth.service';

@Injectable()
export class WsJwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    const token =
      client.handshake.auth?.token ||
      client.handshake.headers?.authorization?.split(' ')[1];

    if (!token) {
      throw new WsException('Missing authentication token');
    }

    try {
      const payload = await this.authService.validateToken(token);
      if (!payload) {
        throw new WsException('Invalid authentication token');
      }
      client.data.user = payload;
      return true;
    } catch {
      throw new WsException('Invalid authentication token');
    }
  }
}
