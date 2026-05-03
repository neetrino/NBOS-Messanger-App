"use client";

import type { MessageAttachmentDto } from "@app-messenger/shared";
import { formatFileSize } from "@/lib/chat-attachment-client";
import {
  AuthenticatedChatImage,
  AuthenticatedChatVideo,
} from "@/components/authenticated-chat-attachment-media";
import { useCallback, useState, type ReactElement } from "react";

type AuthHeadersFn = () => Record<string, string>;

function FileDownloadRow(props: {
  apiBase: string;
  att: MessageAttachmentDto;
  getAuthHeaders: AuthHeadersFn;
  mine: boolean;
}): ReactElement {
  const { apiBase, att, getAuthHeaders, mine } = props;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  const onDownload = useCallback(async () => {
    setBusy(true);
    setErr(false);
    try {
      const res = await fetch(
        `${apiBase}/files/${encodeURIComponent(att.fileId)}`,
        { headers: getAuthHeaders() },
      );
      if (!res.ok) {
        throw new Error("download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = att.originalName;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }, [apiBase, att.fileId, att.originalName, getAuthHeaders]);

  return (
    <div
      className={`mt-2 flex max-w-[240px] flex-col gap-2 rounded-xl px-3 py-2 ${
        mine ? "bg-black/15" : "bg-black/20"
      }`}
    >
      <p className="truncate text-[13px] font-medium text-[#e4ecf5]">
        {att.originalName}
      </p>
      <p className="text-[11px] text-[#8eb4e0]">{formatFileSize(att.size)}</p>
      <button
        type="button"
        onClick={() => void onDownload()}
        disabled={busy}
        className="self-start rounded-lg bg-white/10 px-2 py-1 text-[12px] text-[#e4ecf5] hover:bg-white/15 disabled:opacity-50"
      >
        {busy ? "…" : err ? "Retry" : "Download"}
      </button>
    </div>
  );
}

export function ChatMessageAttachment(props: {
  attachment: MessageAttachmentDto;
  apiBase: string;
  getAuthHeaders: AuthHeadersFn;
  mine: boolean;
}): ReactElement {
  const { attachment: att, apiBase, getAuthHeaders, mine } = props;
  if (att.kind === "image") {
    return (
      <div className="mt-1 inline-block max-w-[min(260px,85vw)] overflow-hidden rounded-lg align-top">
        <AuthenticatedChatImage
          apiBase={apiBase}
          fileId={att.fileId}
          getAuthHeaders={getAuthHeaders}
          className="block max-h-52 w-auto max-w-full rounded-lg object-cover"
        />
      </div>
    );
  }
  if (att.kind === "video") {
    return (
      <div className="mt-1 overflow-hidden rounded-lg">
        <AuthenticatedChatVideo
          apiBase={apiBase}
          fileId={att.fileId}
          getAuthHeaders={getAuthHeaders}
          className="max-h-56 w-full max-w-[280px] rounded-lg"
        />
        <p className="mt-1 truncate text-[11px] text-white/70">{att.originalName}</p>
      </div>
    );
  }
  return (
    <FileDownloadRow
      apiBase={apiBase}
      att={att}
      getAuthHeaders={getAuthHeaders}
      mine={mine}
    />
  );
}
