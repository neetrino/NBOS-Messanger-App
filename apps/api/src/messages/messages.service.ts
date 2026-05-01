import { Injectable } from '@nestjs/common';
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
}
