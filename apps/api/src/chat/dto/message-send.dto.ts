import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class MessageSendDto {
  @IsString()
  @MinLength(1)
  conversationId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientMessageId?: string;
}
