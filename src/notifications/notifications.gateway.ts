import { Injectable } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Notification } from './notification.entity';

// Minimal realtime layer: each connected client joins a room named after
// its own user id (sent right after connecting), and we push new
// notifications into that room. Auth on the socket itself is intentionally
// simple here - see README for hardening notes (verify the JWT on connect
// before trusting the joinRoom userId in a production deployment).
@Injectable()
@WebSocketGateway({ cors: { origin: '*' } })
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(_client: Socket) {}
  handleDisconnect(_client: Socket) {}

  @SubscribeMessage('join')
  handleJoin(client: Socket, userId: string) {
    client.join(`user:${userId}`);
  }

  pushToUser(userId: string, notification: Notification) {
    this.server?.to(`user:${userId}`).emit('notification', notification);
  }

  // Generic realtime signal used by Tickets/Forum/Calendar so open views
  // update live instead of needing a manual refresh. Deliberately just a
  // lightweight "something changed" ping (small payload, e.g. a ticket or
  // question id) rather than pushing full entity data - the receiving
  // component quietly re-fetches through its normal, already-authorized
  // API call. That keeps this gateway simple and avoids ever needing to
  // duplicate access-control logic in the socket layer.
  broadcast(event: string, payload: unknown) {
    this.server?.emit(event, payload);
  }
}
