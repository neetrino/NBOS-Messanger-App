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

export function clientMimeHintForFile(file: File): string {
  if (file.type && file.type !== "application/octet-stream") {
    return file.type.split(";")[0]?.trim() ?? file.type;
  }
  const name = file.name.toLowerCase();
  for (const [re, mime] of EXT_MIME) {
    if (re.test(name)) {
      return mime;
    }
  }
  return "application/octet-stream";
}

export type ClientAttachmentPickResult =
  | { ok: true; kind: AttachmentKind }
  | { ok: false; message: string };

export function validateBrowserFile(file: File): ClientAttachmentPickResult {
  const mime = clientMimeHintForFile(file);
  const v = validateChatAttachmentMeta({
    mimeType: mime,
    sizeBytes: file.size,
  });
  if (!v.ok) {
    if (v.code === "file-too-large") {
      return { ok: false, message: "File is too large" };
    }
    return { ok: false, message: "Unsupported file type" };
  }
  return { ok: true, kind: v.kind };
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
