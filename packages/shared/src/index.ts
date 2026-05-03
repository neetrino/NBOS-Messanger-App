export { DEMO_PASSWORD, DEMO_USERS } from "./demo-users";
export { EMOJI_QUICK_PICK } from "./emoji-quick-pick";

/** Socket.IO event names — keep in sync across web, mobile, and API */
export const SocketEvents = {
  JOIN_CONVERSATION: "conversation:join",
  LEAVE_CONVERSATION: "conversation:leave",
  MESSAGE_SEND: "message:send",
  MESSAGE_NEW: "message:new",
  ERROR: "error",
} as const;

export type SocketEventName = (typeof SocketEvents)[keyof typeof SocketEvents];

export type MessageNewPayload = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

export type MessageSendPayload = {
  conversationId: string;
  body: string;
  clientMessageId?: string;
};
