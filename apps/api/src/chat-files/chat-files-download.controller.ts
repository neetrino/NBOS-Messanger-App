import { Controller, Get, Param, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard, type RequestWithUser } from '../auth/jwt-auth.guard';
import { ChatFilesService } from './chat-files.service';

@Controller('files')
export class ChatFilesDownloadController {
  constructor(private readonly chatFiles: ChatFilesService) {}

  @Get(':fileId')
  @UseGuards(JwtAuthGuard)
  async stream(
    @Req() req: RequestWithUser,
    @Param('fileId') fileId: string,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    await this.chatFiles.streamToResponse({
      userId: req.userId,
      fileId,
      res,
    });
  }
}
