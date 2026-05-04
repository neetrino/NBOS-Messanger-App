import { IsBoolean, IsString, MinLength } from 'class-validator';

export class TypingSendDto {
  @IsString()
  @MinLength(1)
  conversationId!: string;

  @IsBoolean()
  isTyping!: boolean;
}
