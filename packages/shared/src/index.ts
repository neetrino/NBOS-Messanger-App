import type { MessageAttachmentDto } from "./attachments";
export { DEMO_PASSWORD, DEMO_USERS } from "./demo-users";
export { EMOJI_QUICK_PICK } from "./emoji-quick-pick";
export {
  CHAT_ATTACHMENT_DOCUMENT_MAX_BYTES,
  CHAT_ATTACHMENT_IMAGE_MAX_BYTES,
  CHAT_ATTACHMENT_INPUT_ACCEPT,
  CHAT_ATTACHMENT_UPLOAD_MAX_BYTES,
  CHAT_ATTACHMENT_VIDEO_MAX_BYTES,
  CHAT_DOCUMENT_PICKER_TYPES,
  classifyAttachmentKind,
  maxBytesForAttachmentKind,
  validateChatAttachmentMeta,
} from "./attachments";
export type {
  AttachmentKind,
  ChatAttachmentValidationErrorCode,
  MessageAttachmentDto,
} from "./attachments";

/** Shown in chat when a message was deleted for everyone */
export const MESSAGE_DELETED_BODY = "This message was deleted";

/** Socket.IO event names — keep in sync across web, mobile, and API */
export const SocketEvents = {
  JOIN_CONVERSATION: "conversation:join",
  LEAVE_CONVERSATION: "conversation:leave",
  MESSAGE_SEND: "message:send",
  MESSAGE_NEW: "message:new",
  MESSAGE_DELETED_FOR_EVERYONE: "message:deleted-for-everyone",
  ERROR: "error",
} as const;

export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];

export type MessageNewPayload = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  attachment?: MessageAttachmentDto | null;
};

export type MessageDeletedForEveryonePayload = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  deletedForEveryone: true;
};

export type MessageSendPayload = {
  conversationId: string;
  body: string;
  attachment?: { fileId: string };
  clientMessageId?: string;
};
