import { IsString, MinLength } from 'class-validator';

export class ConversationIdDto {
  @IsString()
  @MinLength(1)
  conversationId!: string;
}
