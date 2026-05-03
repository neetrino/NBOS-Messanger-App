import type {
  AttachmentKind,
  MessageAttachmentDto,
} from '@app-messenger/shared';

function isKind(v: unknown): v is AttachmentKind {
  return v === 'image' || v === 'video' || v === 'file';
}

export function parseStoredAttachment(
  raw: unknown,
): MessageAttachmentDto | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const fileId = typeof o.fileId === 'string' ? o.fileId : '';
  const kind = o.kind;
  const originalName = typeof o.originalName === 'string' ? o.originalName : '';
  const mimeType = typeof o.mimeType === 'string' ? o.mimeType : '';
  const size =
    typeof o.size === 'number' && Number.isFinite(o.size) ? o.size : -1;
  if (!fileId || !isKind(kind) || !originalName || !mimeType || size < 0) {
    return undefined;
  }
  return { fileId, kind, originalName, mimeType, size };
}
