import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MESSAGE_DELETED_BODY,
  type MessageAttachmentDto,
} from '@app-messenger/shared';
import type { Message } from '@prisma/client';
import { parseStoredAttachment } from '../messages/attachment-json.util';
import { PrismaService } from '../prisma/prisma.service';

export type ConversationMessageDto = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  deletedForEveryone?: boolean;
  attachment?: MessageAttachmentDto | null;
};

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForMembers(params: { title?: string; memberIds: string[] }) {
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

  listForUser(userId: string) {
    return this.prisma.conversation.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: 'desc' },
      include: {
        members: {
          include: {
            user: { select: { id: true, email: true, name: true } },
          },
        },
      },
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
  ): Promise<ConversationMessageDto[]> {
    await this.assertMember(userId, conversationId);
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        NOT: { hiddenForUserIds: { has: userId } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 100),
    });
    return rows.reverse().map((m) => this.mapMessageForViewer(m));
  }

  private mapMessageForViewer(m: Message): ConversationMessageDto {
    const deletedForEveryone = Boolean(m.deletedForEveryoneAt);
    const base: ConversationMessageDto = {
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      body: deletedForEveryone ? MESSAGE_DELETED_BODY : m.body,
      createdAt: m.createdAt.toISOString(),
    };
    if (deletedForEveryone) {
      base.deletedForEveryone = true;
      return base;
    }
    const att = parseStoredAttachment(m.attachment);
    if (att) {
      base.attachment = att;
    }
    return base;
  }
}
