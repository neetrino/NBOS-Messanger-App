export type AttachmentKind = "image" | "video" | "file";

/** Stored on message rows and emitted over the socket */
export type MessageAttachmentDto = {
  fileId: string;
  kind: AttachmentKind;
  originalName: string;
  mimeType: string;
  size: number;
};

/** Large enough for high‑resolution phone / camera JPEGs; must stay ≤ multer limit. */
export const CHAT_ATTACHMENT_IMAGE_MAX_BYTES = 512 * 1024 * 1024;
export const CHAT_ATTACHMENT_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const CHAT_ATTACHMENT_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;

/** Single upload ceiling (multer / reverse proxies should match). */
export const CHAT_ATTACHMENT_UPLOAD_MAX_BYTES = Math.max(
  CHAT_ATTACHMENT_IMAGE_MAX_BYTES,
  CHAT_ATTACHMENT_VIDEO_MAX_BYTES,
  CHAT_ATTACHMENT_DOCUMENT_MAX_BYTES,
);

const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const VIDEO_MIMES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);
const DOCUMENT_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "application/zip",
]);

export function classifyAttachmentKind(mimeType: string): AttachmentKind | null {
  const m = mimeType.toLowerCase().split(";")[0]?.trim() ?? "";
  if (IMAGE_MIMES.has(m)) {
    return "image";
  }
  if (VIDEO_MIMES.has(m)) {
    return "video";
  }
  if (DOCUMENT_MIMES.has(m)) {
    return "file";
  }
  return null;
}

export function maxBytesForAttachmentKind(kind: AttachmentKind): number {
  switch (kind) {
    case "image":
      return CHAT_ATTACHMENT_IMAGE_MAX_BYTES;
    case "video":
      return CHAT_ATTACHMENT_VIDEO_MAX_BYTES;
    case "file":
      return CHAT_ATTACHMENT_DOCUMENT_MAX_BYTES;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export type ChatAttachmentValidationErrorCode =
  | "unsupported-type"
  | "file-too-large";

export function validateChatAttachmentMeta(params: {
  mimeType: string;
  sizeBytes: number;
}):
  | { ok: true; kind: AttachmentKind }
  | { ok: false; code: ChatAttachmentValidationErrorCode } {
  const kind = classifyAttachmentKind(params.mimeType);
  if (!kind) {
    return { ok: false, code: "unsupported-type" };
  }
  const max = maxBytesForAttachmentKind(kind);
  if (params.sizeBytes > max) {
    return { ok: false, code: "file-too-large" };
  }
  return { ok: true, kind };
}

/** For `<input accept="...">` (broad hints; MIME validation is authoritative). */
export const CHAT_ATTACHMENT_INPUT_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip";

/** For Expo DocumentPicker `type` (MIME validation still runs on upload). */
export const CHAT_DOCUMENT_PICKER_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "application/zip",
] as const;
