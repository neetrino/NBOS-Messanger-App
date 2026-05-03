import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ChatFilesDownloadController } from './chat-files-download.controller';
import { ChatFilesService } from './chat-files.service';
import { ConversationAttachmentsController } from './conversation-attachments.controller';

@Module({
  imports: [PrismaModule, ConversationsModule, AuthModule],
  controllers: [ConversationAttachmentsController, ChatFilesDownloadController],
  providers: [ChatFilesService],
  exports: [ChatFilesService],
})
export class ChatFilesModule {}
