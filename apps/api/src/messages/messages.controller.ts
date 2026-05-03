import {
  Controller,
  Delete,
  forwardRef,
  Inject,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RequestWithUser } from '../auth/jwt-auth.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatGateway } from '../chat/chat.gateway';
import {
  MessageDeleteMode,
  MessageDeleteQueryDto,
} from './dto/message-delete-query.dto';
import { MessagesService } from './messages.service';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(
    private readonly messages: MessagesService,
    @Inject(forwardRef(() => ChatGateway))
    private readonly chatGateway: ChatGateway,
  ) {}

  @Delete(':messageId')
  async deleteMessage(
    @Req() req: RequestWithUser,
    @Param('messageId') messageId: string,
    @Query() query: MessageDeleteQueryDto,
  ) {
    if (query.mode === MessageDeleteMode.FOR_ME) {
      await this.messages.deleteForMe({
        userId: req.userId,
        messageId,
      });
      return { ok: true as const };
    }
    const payload = await this.messages.deleteForEveryone({
      userId: req.userId,
      messageId,
    });
    this.chatGateway.emitMessageDeletedForEveryone(payload);
    return { ok: true as const };
  }
}
