import { IsEnum } from 'class-validator';

export enum MessageDeleteMode {
  FOR_ME = 'for-me',
  FOR_EVERYONE = 'for-everyone',
}

export class MessageDeleteQueryDto {
  @IsEnum(MessageDeleteMode)
  mode!: MessageDeleteMode;
}
