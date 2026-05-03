import {
  validateChatAttachmentMeta,
  type AttachmentKind,
} from "@app-messenger/shared";

const EXT_MIME: ReadonlyArray<[RegExp, string]> = [
  [/\.jpe?g$/i, "image/jpeg"],
  [/\.png$/i, "image/png"],
  [/\.webp$/i, "image/webp"],
  [/\.gif$/i, "image/gif"],
  [/\.mp4$/i, "video/mp4"],
  [/\.mov$/i, "video/quicktime"],
  [/\.webm$/i, "video/webm"],
  [/\.pdf$/i, "application/pdf"],
  [/\.doc$/i, "application/msword"],
  [/\.docx$/i, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  [/\.xls$/i, "application/vnd.ms-excel"],
  [/\.xlsx$/i, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  [/\.ppt$/i, "application/vnd.ms-powerpoint"],
  [/\.pptx$/i, "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  [/\.txt$/i, "text/plain"],
  [/\.zip$/i, "application/zip"],
];

function mimeFromName(name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [re, mime] of EXT_MIME) {
    if (re.test(lower)) {
      return mime;
    }
  }
  return undefined;
}

export function validatePickedAsset(params: {
  name: string;
  mimeType: string | null | undefined;
  size: number | null | undefined;
}):
  | { ok: true; kind: AttachmentKind; mimeType: string }
  | { ok: false; message: string } {
  const rawMime = params.mimeType?.split(";")[0]?.trim();
  const mime =
    rawMime && rawMime !== "application/octet-stream"
      ? rawMime
      : mimeFromName(params.name);
  if (!mime) {
    return { ok: false, message: "Unsupported file type" };
  }
  const size =
    typeof params.size === "number" && Number.isFinite(params.size)
      ? params.size
      : 0;
  if (size <= 0) {
    return { ok: false, message: "Unsupported file type" };
  }
  const v = validateChatAttachmentMeta({ mimeType: mime, sizeBytes: size });
  if (!v.ok) {
    if (v.code === "file-too-large") {
      return { ok: false, message: "File is too large" };
    }
    return { ok: false, message: "Unsupported file type" };
  }
  return { ok: true, kind: v.kind, mimeType: mime };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
