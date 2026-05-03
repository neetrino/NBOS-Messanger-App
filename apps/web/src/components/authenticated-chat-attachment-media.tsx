"use client";

import { useCallback, useEffect, useState, type ReactElement } from "react";

type AuthHeadersFn = () => Record<string, string>;

async function fetchBlobUrl(
  apiBase: string,
  fileId: string,
  getAuthHeaders: AuthHeadersFn,
): Promise<string> {
  const res = await fetch(
    `${apiBase}/files/${encodeURIComponent(fileId)}`,
    { headers: getAuthHeaders() },
  );
  if (!res.ok) {
    throw new Error("Failed to load attachment");
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

function ChatImageLightbox(props: {
  url: string;
  onClose: () => void;
}): ReactElement {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        props.onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Full size image"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/88 p-3"
      onClick={props.onClose}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- blob URL */}
      <img
        src={props.url}
        alt=""
        className="max-h-[min(92dvh,92vh)] max-w-[min(96dvw,96vw)] object-contain shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export function AuthenticatedChatImage(props: {
  apiBase: string;
  fileId: string;
  getAuthHeaders: AuthHeadersFn;
  className?: string;
  /** When true, tap/click opens a full-screen preview (default: true). */
  lightboxEnabled?: boolean;
}): ReactElement {
  const { apiBase, fileId, getAuthHeaders, className, lightboxEnabled = true } =
    props;
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const closeLightbox = useCallback(() => setLightboxOpen(false), []);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const u = await fetchBlobUrl(apiBase, fileId, getAuthHeaders);
        objectUrl = u;
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        setUrl(u);
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [apiBase, fileId, getAuthHeaders]);
  if (failed) {
    return (
      <p className="text-[13px] text-white/80">Could not load image</p>
    );
  }
  if (!url) {
    return (
      <div className="h-32 w-[min(220px,85vw)] max-w-full animate-pulse rounded-lg bg-black/20" />
    );
  }
  if (!lightboxEnabled) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- blob URLs from authenticated API
      <img src={url} alt="" className={className} />
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setLightboxOpen(true)}
        className="group block max-w-full cursor-zoom-in rounded-lg p-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
        aria-label="View full size"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- blob URLs from authenticated API */}
        <img
          src={url}
          alt=""
          className={className}
        />
      </button>
      {lightboxOpen ? (
        <ChatImageLightbox url={url} onClose={closeLightbox} />
      ) : null}
    </>
  );
}

export function AuthenticatedChatVideo(props: {
  apiBase: string;
  fileId: string;
  getAuthHeaders: AuthHeadersFn;
  className?: string;
}): ReactElement {
  const { apiBase, fileId, getAuthHeaders, className } = props;
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    void (async () => {
      try {
        const u = await fetchBlobUrl(apiBase, fileId, getAuthHeaders);
        objectUrl = u;
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        setUrl(u);
      } catch {
        if (!cancelled) {
          setFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [apiBase, fileId, getAuthHeaders]);
  if (failed) {
    return (
      <p className="text-[13px] text-white/80">Could not load video</p>
    );
  }
  if (!url) {
    return (
      <div className="h-36 w-full max-w-[260px] animate-pulse rounded-lg bg-black/20" />
    );
  }
  return (
    <video
      src={url}
      controls
      className={className}
      playsInline
      preload="metadata"
    />
  );
}
