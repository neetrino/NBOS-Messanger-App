import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class MessageAttachmentRefDto {
  @IsString()
  @MinLength(1)
  fileId!: string;
}

export class MessageSendDto {
  @IsString()
  @MinLength(1)
  conversationId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  body?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MessageAttachmentRefDto)
  attachment?: MessageAttachmentRefDto;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientMessageId?: string;
}
