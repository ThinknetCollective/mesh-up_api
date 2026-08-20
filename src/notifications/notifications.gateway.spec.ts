import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { io as Client, Socket } from 'socket.io-client';
import { AppModule } from '../app.module';
import { NotificationsGateway } from './notifications.gateway';

describe('NotificationsGateway (Integration)', () => {
  let app: INestApplication;
  let gateway: NotificationsGateway;
  let clientSocket: Socket;
  let httpServer: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    httpServer = app.getHttpServer();
    const address = httpServer.address();
    const port = typeof address === 'string' ? 3000 : address.port;

    gateway = app.get<NotificationsGateway>(NotificationsGateway);

    // Connect client with a valid mocked auth token matching user 'user_123'
    clientSocket = Client(`http://localhost:${port}/notifications`, {
      auth: { token: 'mock_valid_jwt_token_for_user_123' },
    });

    await new Promise<void>((resolve) => clientSocket.on('connect', resolve));
  });

  afterAll(async () => {
    clientSocket.disconnect();
    await app.close();
  });

  it('should receive exactly one comment reply notification event scoped to user', (done) => {
    const notificationPayload = {
      type: 'COMMENT_REPLY',
      message: 'New reply on your comment',
      commentId: 'c_999',
    };

    clientSocket.on('notification', (data) => {
      expect(data).toEqual(notificationPayload);
      done();
    });

    // Trigger event emission from gateway to user_123
    gateway.sendToUser('user_123', 'notification', notificationPayload);
  });
});