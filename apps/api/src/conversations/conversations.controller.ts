import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RequestWithUser } from '../auth/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ConversationsService } from './conversations.service';
import { CreateConversationDto } from './dto/create-conversation.dto';

@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list(@Req() req: RequestWithUser) {
    return this.conversations.listForUser(req.userId);
  }

  @Post()
  async create(
    @Req() req: RequestWithUser,
    @Body() dto: CreateConversationDto,
  ) {
    const memberIds = dto.memberIds.includes(req.userId)
      ? dto.memberIds
      : [...dto.memberIds, req.userId];
    return this.conversations.createForMembers({
      title: dto.title,
      memberIds,
    });
  }

  @Get(':id/messages')
  messages(
    @Req() req: RequestWithUser,
    @Param('id') conversationId: string,
    @Query('take') take?: string,
  ) {
    const n = take ? Number.parseInt(take, 10) : 50;
    return this.conversations.listMessages(
      req.userId,
      conversationId,
      Number.isFinite(n) ? n : 50,
    );
  }
}
