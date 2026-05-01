import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { MessagesService } from './messages.service';

@Module({
  imports: [ConversationsModule],
  providers: [MessagesService],
  exports: [MessagesService],
})
export class MessagesModule {}
