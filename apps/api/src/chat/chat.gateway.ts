import { UsePipes, ValidationPipe } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  SocketEvents,
  type MessageDeletedForEveryonePayload,
  type MessageNewPayload,
} from '@app-messenger/shared';
import { parseStoredAttachment } from '../messages/attachment-json.util';
import type { Server, Socket } from 'socket.io';
import { ConversationsService } from '../conversations/conversations.service';
import { MessagesService } from '../messages/messages.service';
import { ConversationIdDto } from './dto/conversation-id.dto';
import { MessageSendDto } from './dto/message-send.dto';

type JwtPayload = { sub: string };

type AuthedSocket = Socket & { data: { userId?: string } };

@WebSocketGateway({
  cors: { origin: true, credentials: true },
})
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly messages: MessagesService,
    private readonly conversations: ConversationsService,
  ) {}

  async handleConnection(client: AuthedSocket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token);
      client.data.userId = payload.sub;
    } catch {
      client.disconnect(true);
    }
  }

  @SubscribeMessage(SocketEvents.JOIN_CONVERSATION)
  async joinConversation(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: ConversationIdDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }
    await this.conversations.assertMember(userId, body.conversationId);
    await client.join(roomName(body.conversationId));
  }

  @SubscribeMessage(SocketEvents.LEAVE_CONVERSATION)
  async leaveConversation(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: ConversationIdDto,
  ): Promise<void> {
    await client.leave(roomName(body.conversationId));
  }

  @SubscribeMessage(SocketEvents.MESSAGE_SEND)
  async onMessageSend(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: MessageSendDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }
    const hasBody =
      typeof body.body === 'string' && body.body.trim().length > 0;
    const hasAtt = Boolean(body.attachment?.fileId?.trim());
    if (!hasBody && !hasAtt) {
      throw new WsException('Message must include text or an attachment');
    }
    const saved = await this.messages.createInConversation({
      senderId: userId,
      conversationId: body.conversationId,
      body: String(body.body ?? '').trim(),
      attachmentFileId: body.attachment?.fileId,
    });
    const attachment = parseStoredAttachment(saved.attachment);
    const payload: MessageNewPayload = {
      id: saved.id,
      conversationId: saved.conversationId,
      senderId: saved.senderId,
      body: saved.body,
      createdAt: saved.createdAt.toISOString(),
      ...(attachment ? { attachment } : {}),
    };
    this.server
      .to(roomName(saved.conversationId))
      .emit(SocketEvents.MESSAGE_NEW, payload);
  }

  emitMessageDeletedForEveryone(
    payload: MessageDeletedForEveryonePayload,
  ): void {
    this.server
      .to(roomName(payload.conversationId))
      .emit(SocketEvents.MESSAGE_DELETED_FOR_EVERYONE, payload);
  }

  private extractToken(client: Socket): string | undefined {
    const fromAuth = client.handshake.auth as { token?: string } | undefined;
    if (fromAuth?.token && typeof fromAuth.token === 'string') {
      return fromAuth.token;
    }
    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim();
    }
    return undefined;
  }
}

function roomName(conversationId: string): string {
  return `conversation:${conversationId}`;
}
