import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MESSAGE_DELETED_BODY,
  type MessageDeletedForEveryonePayload,
} from '@app-messenger/shared';
import type { Message } from '@prisma/client';
import { ConversationsService } from '../conversations/conversations.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
  ) {}

  async createInConversation(params: {
    senderId: string;
    conversationId: string;
    body: string;
  }): Promise<Message> {
    await this.conversations.assertMember(
      params.senderId,
      params.conversationId,
    );
    return this.prisma.message.create({
      data: {
        conversationId: params.conversationId,
        senderId: params.senderId,
        body: params.body,
      },
    });
  }

  async deleteForMe(params: {
    userId: string;
    messageId: string;
  }): Promise<void> {
    const msg = await this.prisma.message.findUnique({
      where: { id: params.messageId },
    });
    if (!msg) {
      throw new NotFoundException('Message not found');
    }
    await this.conversations.assertMember(params.userId, msg.conversationId);
    if (msg.hiddenForUserIds.includes(params.userId)) {
      return;
    }
    await this.prisma.message.update({
      where: { id: params.messageId },
      data: {
        hiddenForUserIds: { set: [...msg.hiddenForUserIds, params.userId] },
      },
    });
  }

  async deleteForEveryone(params: {
    userId: string;
    messageId: string;
  }): Promise<MessageDeletedForEveryonePayload> {
    const msg = await this.prisma.message.findUnique({
      where: { id: params.messageId },
    });
    if (!msg) {
      throw new NotFoundException('Message not found');
    }
    await this.conversations.assertMember(params.userId, msg.conversationId);
    if (msg.senderId !== params.userId) {
      throw new ForbiddenException(
        'You can only delete your own messages for everyone',
      );
    }
    if (msg.deletedForEveryoneAt) {
      return this.toDeletedForEveryonePayload(msg);
    }
    const updated = await this.prisma.message.update({
      where: { id: params.messageId },
      data: { deletedForEveryoneAt: new Date() },
    });
    return this.toDeletedForEveryonePayload(updated);
  }

  private toDeletedForEveryonePayload(
    m: Pick<Message, 'id' | 'conversationId' | 'senderId' | 'createdAt'>,
  ): MessageDeletedForEveryonePayload {
    return {
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      body: MESSAGE_DELETED_BODY,
      createdAt: m.createdAt.toISOString(),
      deletedForEveryone: true,
    };
  }
}
