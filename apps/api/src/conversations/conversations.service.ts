import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Conversation, Message } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForMembers(params: {
    title?: string;
    memberIds: string[];
  }): Promise<Conversation> {
    const unique = [...new Set(params.memberIds)];
    if (unique.length < 2) {
      throw new BadRequestException(
        'A conversation needs at least two distinct members',
      );
    }
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true },
    });
    if (users.length !== unique.length) {
      throw new NotFoundException('One or more users not found');
    }
    return this.prisma.conversation.create({
      data: {
        title: params.title,
        members: {
          create: unique.map((userId) => ({ userId })),
        },
      },
    });
  }

  listForUser(userId: string): Promise<Conversation[]> {
    return this.prisma.conversation.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async assertMember(userId: string, conversationId: string): Promise<void> {
    const row = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });
    if (!row) {
      throw new ForbiddenException('Not a member of this conversation');
    }
  }

  async listMessages(
    userId: string,
    conversationId: string,
    take = 50,
  ): Promise<Message[]> {
    await this.assertMember(userId, conversationId);
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 100),
    });
  }
}
