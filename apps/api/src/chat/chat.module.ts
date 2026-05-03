import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { MessagesModule } from '../messages/messages.module';
import { ChatGateway } from './chat.gateway';

@Module({
  imports: [AuthModule, ConversationsModule, forwardRef(() => MessagesModule)],
  providers: [ChatGateway],
  exports: [ChatGateway],
})
export class ChatModule {}
