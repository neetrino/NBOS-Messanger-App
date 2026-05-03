import {
  BadRequestException,
  Controller,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Express } from 'express';
import { CHAT_ATTACHMENT_UPLOAD_MAX_BYTES } from '@app-messenger/shared';
import { JwtAuthGuard, type RequestWithUser } from '../auth/jwt-auth.guard';
import { ChatFilesService } from './chat-files.service';

function uploadsChatDir(): string {
  return join(process.cwd(), 'uploads', 'chat');
}

@Controller('conversations')
export class ConversationAttachmentsController {
  constructor(private readonly chatFiles: ChatFilesService) {}

  @Post(':conversationId/attachments')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: CHAT_ATTACHMENT_UPLOAD_MAX_BYTES },
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = uploadsChatDir();
          mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (_req, _file, cb) => {
          cb(null, `${randomUUID()}.uploading`);
        },
      }),
    }),
  )
  async upload(
    @Req() req: RequestWithUser,
    @Param('conversationId') conversationId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!file?.path) {
      throw new BadRequestException('Missing file');
    }
    return this.chatFiles.saveUploadedFile({
      userId: req.userId,
      conversationId,
      diskPath: file.path,
      originalName: file.originalname,
      reportedSize: file.size,
    });
  }
}
