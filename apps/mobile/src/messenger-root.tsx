import {
  CHAT_TYPING_PRESENCE_TTL_MS,
  EMOJI_QUICK_PICK,
  MESSAGE_DELETED_BODY,
  OutgoingTypingController,
  SocketEvents,
  formatTypingIndicatorText,
  type AttachmentKind,
  type MessageAttachmentDto,
  type MessageDeletedForEveryonePayload,
  type MessageNewPayload,
  type MessageSendPayload,
  type TypingPresencePayload,
} from "@app-messenger/shared";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  type AppStateStatus,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { io, type Socket } from "socket.io-client";
import { ClipBrandIcon } from "./components/clip-brand-icon";
import { AuthGate } from "./auth-gate";
import { getApiBaseUrl } from "./api-base";
import { ChatMessageAttachmentBubble } from "./chat-message-attachment-bubble";
import { formatFileSize, validatePickedAsset } from "./chat-attachment-mobile";
import { DEMO_PASSWORD, DEMO_USERS } from "./demo-users";

type Me = { id: string; email: string; name: string | null };
type MemberUser = { id: string; email: string; name: string | null };
type ConversationRow = {
  id: string;
  title: string | null;
  createdAt: string;
  members: Array<{ userId: string; user: MemberUser }>;
};
type MessageRow = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  deletedForEveryone?: boolean;
  attachment?: MessageAttachmentDto | null;
};

type PendingMobileAttachment = {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
  kind: AttachmentKind;
};

function displayName(user: MemberUser | Me): string {
  return user.name?.trim() || user.email.split("@")[0] || user.email;
}

function conversationLabel(c: ConversationRow, meId: string | undefined): string {
  if (c.title?.trim()) {
    return c.title;
  }
  const others = c.members
    .filter((m) => m.userId !== meId)
    .map((m) => displayName(m.user));
  return others.length ? others.join(", ") : "Chat";
}

function isUnreachableNetworkError(message: string): boolean {
  return (
    message.includes("Network request failed") ||
    message.includes("Failed to fetch")
  );
}

function formatBootLoginError(e: unknown, apiBase: string): string {
  const base = e instanceof Error ? e.message : "Login failed";
  if (!isUnreachableNetworkError(base)) {
    return base;
  }
  return [
    base,
    "",
    `This device cannot reach the API (${apiBase}).`,
    "• Put your PC and phone on the same Wi‑Fi network",
    "• In the repo root `.env`, set EXPO_PUBLIC_API_URL=http://<PC_LAN_IP>:4000",
    "  (Windows: ipconfig → Wireless LAN adapter IPv4 address)",
    "• Or from apps/mobile run: pnpm dev:tunnel",
  ].join("\n");
}

function initialsFromLabel(label: string): string {
  const t = label.trim().slice(0, 2);
  return t.length > 0 ? t.toUpperCase() : "?";
}

function formatMsgTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function formatDayKey(iso: string): string {
  return new Date(iso).toDateString();
}

function formatDayBanner(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) {
    return "Today";
  }
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) {
    return "Yesterday";
  }
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

type ChatListRow =
  | { kind: "sep"; id: string; label: string }
  | { kind: "msg"; id: string; m: MessageRow };

function messageRowsWithSeparators(messages: MessageRow[]): ChatListRow[] {
  const out: ChatListRow[] = [];
  let lastDay = "";
  for (const m of messages) {
    const day = formatDayKey(m.createdAt);
    if (day !== lastDay) {
      lastDay = day;
      out.push({ kind: "sep", id: `sep-${m.id}`, label: formatDayBanner(m.createdAt) });
    }
    out.push({ kind: "msg", id: m.id, m });
  }
  return out;
}

const TG = {
  bg: "#0e1621",
  sidebar: "#292f3f",
  header: "#17212b",
  accent: "#8774e1",
  bubbleIn: "#2b5278",
  text: "#e4e6eb",
  muted: "#8b92a0",
  link: "#6d9fd5",
} as const;

const CHAT_SCROLL_BOTTOM_THRESHOLD = 80;
const COMPOSER_INPUT_MAX_HEIGHT = 168;

type SessionMode = "gate" | "demo" | "jwt";

export function MessengerRoot() {
  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const [sessionMode, setSessionMode] = useState<SessionMode>("gate");
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [activeDemoIndex, setActiveDemoIndex] = useState(0);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingAttachment, setPendingAttachment] =
    useState<PendingMobileAttachment | null>(null);
  const [composerSending, setComposerSending] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [booting, setBooting] = useState(false);
  const [convsLoading, setConvsLoading] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const [stack, setStack] = useState<"list" | "chat">("list");
  const [listQuery, setListQuery] = useState("");
  const [newConvOpen, setNewConvOpen] = useState(false);
  const [otherUserId, setOtherUserId] = useState("");
  const [createConvBusy, setCreateConvBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [deleteActionMessage, setDeleteActionMessage] = useState<MessageRow | null>(
    null,
  );
  const [composerInputHeight, setComposerInputHeight] = useState(48);
  const [menuPanelMounted, setMenuPanelMounted] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const [listChromeHeight, setListChromeHeight] = useState(0);
  const msgListRef = useRef<FlatList<ChatListRow>>(null);
  const stickToBottomRef = useRef(true);
  const socketRef = useRef<Socket | null>(null);
  const draftInputRef = useRef<TextInput>(null);
  const draftSelectionRef = useRef({ start: 0, end: 0 });
  const [typingPeers, setTypingPeers] = useState<
    Record<string, { displayName: string }>
  >({});
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const meIdRef = useRef<string | undefined>(undefined);
  meIdRef.current = me?.id;
  const outgoingTypingRef = useRef<OutgoingTypingController | null>(null);
  const typingExpiryTimersRef = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});

  const clearTypingExpiryTimer = useCallback((userId: string) => {
    const t = typingExpiryTimersRef.current[userId];
    if (t) {
      clearTimeout(t);
    }
    delete typingExpiryTimersRef.current[userId];
  }, []);

  const clearAllTypingExpiryTimers = useCallback(() => {
    for (const id of Object.keys(typingExpiryTimersRef.current)) {
      clearTypingExpiryTimer(id);
    }
  }, [clearTypingExpiryTimer]);

  const applyRemoteTypingPayload = useCallback(
    (payload: TypingPresencePayload, activeId: string | null) => {
      const self = meIdRef.current;
      if (!self || payload.userId === self) {
        return;
      }
      if (!activeId || payload.conversationId !== activeId) {
        return;
      }
      if (!payload.isTyping) {
        clearTypingExpiryTimer(payload.userId);
        setTypingPeers((prev) => {
          if (!prev[payload.userId]) {
            return prev;
          }
          const next = { ...prev };
          delete next[payload.userId];
          return next;
        });
        return;
      }
      clearTypingExpiryTimer(payload.userId);
      setTypingPeers((prev) => ({
        ...prev,
        [payload.userId]: { displayName: payload.userName },
      }));
      typingExpiryTimersRef.current[payload.userId] = setTimeout(() => {
        setTypingPeers((prev) => {
          if (!prev[payload.userId]) {
            return prev;
          }
          const next = { ...prev };
          delete next[payload.userId];
          return next;
        });
        delete typingExpiryTimersRef.current[payload.userId];
      }, CHAT_TYPING_PRESENCE_TTL_MS);
    },
    [clearTypingExpiryTimer],
  );

  const performLogout = useCallback(() => {
    outgoingTypingRef.current?.flushFalse();
    outgoingTypingRef.current = null;
    clearAllTypingExpiryTimers();
    setTypingPeers({});
    const s = socketRef.current;
    if (s) {
      s.removeAllListeners();
      s.disconnect();
      socketRef.current = null;
    }
    setSocketReady(false);
    setMenuOpen(false);
    setEmojiOpen(false);
    setDeleteActionMessage(null);
    setMenuPanelMounted(false);
    menuAnim.setValue(0);
    setToken(null);
    setMe(null);
    setConversations([]);
    setConversationId(null);
    setMessages([]);
    setDraft("");
    setPendingAttachment(null);
    setComposerSending(false);
    setAttachmentError(null);
    setListQuery("");
    setNewConvOpen(false);
    setOtherUserId("");
    setLoadError(null);
    setStack("list");
    setActiveDemoIndex(0);
    setSessionMode("gate");
  }, [clearAllTypingExpiryTimers]);

  useEffect(() => {
    if (menuOpen) {
      setMenuPanelMounted(true);
    }
  }, [menuOpen]);

  useEffect(() => {
    if (menuOpen && menuPanelMounted) {
      menuAnim.setValue(0);
      Animated.timing(menuAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
      return;
    }
    if (!menuOpen && menuPanelMounted) {
      const handle = Animated.timing(menuAnim, {
        toValue: 0,
        duration: 160,
        useNativeDriver: true,
      });
      handle.start(({ finished }) => {
        if (finished) {
          setMenuPanelMounted(false);
        }
      });
      return () => handle.stop();
    }
  }, [menuOpen, menuPanelMounted, menuAnim]);

  const authHeaders = useCallback(
    (t: string) => ({
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
    }),
    [],
  );

  const loginAs = useCallback(
    async (email: string) => {
      setLoadError(null);
      const res = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: DEMO_PASSWORD }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Login failed (${res.status})`);
      }
      const data = (await res.json()) as {
        accessToken: string;
        user: Me;
      };
      setToken(data.accessToken);
      setMe(data.user);
    },
    [apiBase],
  );

  const loadConversations = useCallback(
    async (t: string) => {
      const res = await fetch(`${apiBase}/conversations`, {
        headers: authHeaders(t),
      });
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const rows = (await res.json()) as ConversationRow[];
      setConversations(rows);
      setConversationId((prev) => {
        if (prev && rows.some((r) => r.id === prev)) {
          return prev;
        }
        return rows[0]?.id ?? null;
      });
    },
    [apiBase, authHeaders],
  );

  const createConversation = useCallback(async () => {
    if (!token || !otherUserId.trim()) {
      return;
    }
    setCreateConvBusy(true);
    setLoadError(null);
    try {
      const res = await fetch(`${apiBase}/conversations`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ memberIds: [otherUserId.trim()] }),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(text || `Request failed (${res.status})`);
      }
      const created = JSON.parse(text) as { id: string };
      await loadConversations(token);
      setNewConvOpen(false);
      setOtherUserId("");
      setConversationId(created.id);
      setStack("chat");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreateConvBusy(false);
    }
  }, [apiBase, authHeaders, loadConversations, otherUserId, token]);

  const loadMessages = useCallback(
    async (t: string, convId: string) => {
      const res = await fetch(
        `${apiBase}/conversations/${convId}/messages?take=80`,
        { headers: authHeaders(t) },
      );
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const rows = (await res.json()) as MessageRow[];
      setMessages(rows);
    },
    [apiBase, authHeaders],
  );

  const deleteMessage = useCallback(
    async (messageId: string, mode: "for-me" | "for-everyone") => {
      if (!token) {
        return;
      }
      const res = await fetch(
        `${apiBase}/messages/${encodeURIComponent(messageId)}?mode=${encodeURIComponent(mode)}`,
        { method: "DELETE", headers: authHeaders(token) },
      );
      if (!res.ok) {
        const text = await res.text();
        setLoadError(text || `Delete failed (${res.status})`);
        return;
      }
      if (mode === "for-me") {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        return;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? {
                ...m,
                body: MESSAGE_DELETED_BODY,
                deletedForEveryone: true,
                attachment: undefined,
              }
            : m,
        ),
      );
    },
    [apiBase, authHeaders, token],
  );

  useEffect(() => {
    if (sessionMode !== "demo") {
      return;
    }
    let cancelled = false;
    (async () => {
      setBooting(true);
      setToken(null);
      setMe(null);
      setConversationId(null);
      setMessages([]);
      setConversations([]);
      setLoadError(null);
      setStack("list");
      try {
        const u = DEMO_USERS[activeDemoIndex];
        await loginAs(u.email);
      } catch (e) {
        if (!cancelled) {
          setLoadError(formatBootLoginError(e, apiBase));
        }
      } finally {
        if (!cancelled) {
          setBooting(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeDemoIndex, apiBase, loginAs, sessionMode]);

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    setConvsLoading(true);
    (async () => {
      try {
        await loadConversations(token);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Load failed");
        }
      } finally {
        if (!cancelled) {
          setConvsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, loadConversations]);

  useEffect(() => {
    if (!token || !conversationId) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await loadMessages(token, conversationId);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Messages failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, conversationId, loadMessages]);

  useEffect(() => {
    if (!token || !conversationId) {
      return;
    }
    const activeConvId = conversationId;
    const s = io(apiBase, {
      transports: ["websocket", "polling"],
      auth: { token },
    });
    socketRef.current = s;
    setSocketReady(s.connected);
    setTypingPeers({});
    clearAllTypingExpiryTimers();

    const outgoing = new OutgoingTypingController((isTyping) => {
      if (!s.connected) {
        return;
      }
      s.emit(SocketEvents.TYPING_SEND, {
        conversationId: activeConvId,
        isTyping,
      });
    });
    outgoingTypingRef.current = outgoing;

    const onConnect = () => {
      setSocketReady(true);
      s.emit(SocketEvents.JOIN_CONVERSATION, { conversationId: activeConvId });
      outgoing.syncDraft(draftRef.current);
    };
    const onDisconnect = () => {
      setSocketReady(false);
      setTypingPeers({});
      clearAllTypingExpiryTimers();
    };
    const onMsg = (payload: MessageNewPayload) => {
      if (payload.conversationId !== activeConvId) {
        return;
      }
      setMessages((prev) => {
        if (prev.some((m) => m.id === payload.id)) {
          return prev;
        }
        const next: MessageRow = {
          id: payload.id,
          conversationId: payload.conversationId,
          senderId: payload.senderId,
          body: payload.body,
          createdAt: payload.createdAt,
          ...(payload.attachment ? { attachment: payload.attachment } : {}),
        };
        return [...prev, next];
      });
    };
    const onDeletedForEveryone = (payload: MessageDeletedForEveryonePayload) => {
      if (payload.conversationId !== activeConvId) {
        return;
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === payload.id
            ? {
                id: payload.id,
                conversationId: payload.conversationId,
                senderId: payload.senderId,
                body: payload.body,
                createdAt: payload.createdAt,
                deletedForEveryone: true,
                attachment: undefined,
              }
            : m,
        ),
      );
    };
    const onTyping = (payload: TypingPresencePayload) => {
      applyRemoteTypingPayload(payload, activeConvId);
    };

    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on(SocketEvents.MESSAGE_NEW, onMsg);
    s.on(SocketEvents.MESSAGE_DELETED_FOR_EVERYONE, onDeletedForEveryone);
    s.on(SocketEvents.TYPING_UPDATE, onTyping);
    return () => {
      outgoing.dispose();
      outgoingTypingRef.current = null;
      clearAllTypingExpiryTimers();
      setTypingPeers({});
      setSocketReady(false);
      s.removeAllListeners();
      s.disconnect();
      socketRef.current = null;
    };
  }, [apiBase, applyRemoteTypingPayload, clearAllTypingExpiryTimers, conversationId, token]);

  useEffect(() => {
    outgoingTypingRef.current?.syncDraft(draft);
  }, [draft]);

  useEffect(() => {
    const onApp = (next: AppStateStatus) => {
      if (next !== "active") {
        outgoingTypingRef.current?.flushFalse();
      }
    };
    const sub = AppState.addEventListener("change", onApp);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (stack !== "chat") {
      outgoingTypingRef.current?.flushFalse();
    }
  }, [stack]);

  useEffect(() => {
    setDeleteActionMessage(null);
  }, [conversationId]);

  useEffect(() => {
    setPendingAttachment(null);
    setAttachmentError(null);
  }, [conversationId]);

  const pickAttachment = useCallback(async () => {
    if (!conversationId || !token || composerSending) {
      return;
    }
    try {
      const existing = await ImagePicker.getMediaLibraryPermissionsAsync();
      const requested = existing.granted
        ? existing
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!requested.granted) {
        Alert.alert(
          "Photo library access",
          "To attach photos or videos from your gallery, allow photo library access in Settings.",
        );
        return;
      }

      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images", "videos"],
        allowsEditing: false,
        quality: 1,
      });
      if (r.canceled) {
        return;
      }
      const a = r.assets[0];
      if (!a?.uri) {
        return;
      }
      const baseName =
        a.fileName?.trim() ||
        a.uri.split("/").pop()?.split("?")[0]?.trim() ||
        (a.type === "video" ? "video.mp4" : "image.jpg");
      const v = validatePickedAsset({
        name: baseName,
        mimeType: a.mimeType,
        size: typeof a.fileSize === "number" ? a.fileSize : null,
      });
      if (!v.ok) {
        setAttachmentError(v.message);
        return;
      }
      setAttachmentError(null);
      setPendingAttachment({
        uri: a.uri,
        name: baseName,
        size: typeof a.fileSize === "number" ? a.fileSize : 0,
        mimeType: v.mimeType,
        kind: v.kind,
      });
    } catch {
      setAttachmentError("Could not attach file");
    }
  }, [composerSending, conversationId, token]);

  const send = useCallback(async () => {
    outgoingTypingRef.current?.flushFalse();
    const s = socketRef.current;
    const body = draft.trim();
    if (!socketReady || !s?.connected || !conversationId || !token) {
      return;
    }
    if (!body && !pendingAttachment) {
      return;
    }
    if (composerSending) {
      return;
    }
    setComposerSending(true);
    try {
      let uploaded: MessageAttachmentDto | undefined;
      if (pendingAttachment) {
        const form = new FormData();
        form.append(
          "file",
          {
            uri: pendingAttachment.uri,
            name: pendingAttachment.name,
            type: pendingAttachment.mimeType,
          } as unknown as Blob,
        );
        const res = await fetch(
          `${apiBase}/conversations/${encodeURIComponent(conversationId)}/attachments`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          },
        );
        if (!res.ok) {
          setAttachmentError("Upload failed. Please try again.");
          return;
        }
        uploaded = (await res.json()) as MessageAttachmentDto;
      }
      stickToBottomRef.current = true;
      const payload: MessageSendPayload = {
        conversationId,
        body,
        ...(uploaded ? { attachment: { fileId: uploaded.fileId } } : {}),
      };
      s.emit(SocketEvents.MESSAGE_SEND, payload);
      setDraft("");
      setPendingAttachment(null);
      setEmojiOpen(false);
    } finally {
      setComposerSending(false);
    }
  }, [
    apiBase,
    composerSending,
    conversationId,
    draft,
    pendingAttachment,
    socketReady,
    token,
  ]);

  const insertEmoji = useCallback(
    (emoji: string) => {
      const { start, end } = draftSelectionRef.current;
      const next = draft.slice(0, start) + emoji + draft.slice(end);
      const pos = start + emoji.length;
      setDraft(next);
      draftSelectionRef.current = { start: pos, end: pos };
      requestAnimationFrame(() => {
        draftInputRef.current?.setNativeProps({
          selection: { start: pos, end: pos },
        });
        draftInputRef.current?.focus();
      });
    },
    [draft],
  );

  useEffect(() => {
    if (draft === "") {
      draftSelectionRef.current = { start: 0, end: 0 };
    }
  }, [draft]);

  useEffect(() => {
    setEmojiOpen(false);
  }, [conversationId]);

  useEffect(() => {
    if (stack !== "chat") {
      setEmojiOpen(false);
    }
  }, [stack]);

  const emojiCellSize = useMemo(
    () => Math.max(36, Math.floor((Dimensions.get("window").width - 32) / 8)),
    [],
  );

  const convTitle = useMemo(() => {
    const c = conversations.find((x) => x.id === conversationId);
    return c ? conversationLabel(c, me?.id) : "Chat";
  }, [conversationId, conversations, me?.id]);

  const activeConversationRow = useMemo(
    () => conversations.find((x) => x.id === conversationId),
    [conversationId, conversations],
  );

  const typingIndicatorText = useMemo(() => {
    const isDirectChat = (activeConversationRow?.members.length ?? 0) === 2;
    const names = Object.entries(typingPeers)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v.displayName);
    return formatTypingIndicatorText({
      isDirectChat,
      typingDisplayNames: names,
    });
  }, [activeConversationRow?.members.length, typingPeers]);

  const filteredConversations = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) {
      return conversations;
    }
    return conversations.filter((c) =>
      conversationLabel(c, me?.id).toLowerCase().includes(q),
    );
  }, [conversations, listQuery, me?.id]);

  const chatRows = useMemo(() => messageRowsWithSeparators(messages), [messages]);

  const handleMessageListScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
      const range = contentSize.height - layoutMeasurement.height;
      if (range <= 0) {
        stickToBottomRef.current = true;
        return;
      }
      const distFromBottom = range - contentOffset.y;
      stickToBottomRef.current = distFromBottom < CHAT_SCROLL_BOTTOM_THRESHOLD;
    },
    [],
  );

  const scrollChatToEndIfPinned = useCallback((animated: boolean) => {
    if (stickToBottomRef.current) {
      msgListRef.current?.scrollToEnd({ animated });
    }
  }, []);

  useEffect(() => {
    stickToBottomRef.current = true;
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }
    const id = requestAnimationFrame(() => scrollChatToEndIfPinned(false));
    return () => cancelAnimationFrame(id);
  }, [
    conversationId,
    messages.length,
    messages[messages.length - 1]?.id,
    scrollChatToEndIfPinned,
    typingIndicatorText,
  ]);

  useEffect(() => {
    if (draft === "") {
      setComposerInputHeight(48);
    }
  }, [draft]);

  const topInset =
    Platform.OS === "ios" ? 52 : (StatusBar.currentHeight ?? 0) + 8;

  if (sessionMode === "gate") {
    return (
      <AuthGate
        apiBase={apiBase}
        onJwtSession={(t, user) => {
          setLoadError(null);
          setToken(t);
          setMe(user);
          setSessionMode("jwt");
          setBooting(false);
        }}
        onDemo={() => {
          setSessionMode("demo");
        }}
      />
    );
  }

  if (booting) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={TG.accent} />
        <Text style={styles.muted}>Signing in…</Text>
      </View>
    );
  }

  if (loadError && !token) {
    const showSeedHint = !isUnreachableNetworkError(loadError);
    return (
      <View style={styles.centered}>
        <ScrollView
          style={styles.errorScroll}
          contentContainerStyle={styles.errorScrollContent}
        >
          <Text style={styles.error} selectable>
            {loadError}
          </Text>
        </ScrollView>
        {showSeedHint ? (
          <Text style={styles.muted}>
            Add seed data: run `pnpm db:seed` (repo root)
          </Text>
        ) : null}
      </View>
    );
  }

  const openChat = (id: string) => {
    setMenuOpen(false);
    setConversationId(id);
    setStack("chat");
  };

  const listHeader = (
    <View style={[styles.listHeaderTop, { paddingTop: topInset }]}>
      <View style={styles.listToolbar} collapsable={false}>
        <View style={styles.toolbarSide}>
          <TouchableOpacity
            onPress={() => setMenuOpen((v) => !v)}
            style={styles.iconBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.65}
            accessibilityRole="button"
            accessibilityLabel="Open menu"
            accessibilityState={{ expanded: menuOpen }}
          >
            <Text style={styles.iconBtnText}>☰</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.toolbarCenter} pointerEvents="box-none">
          <Text style={styles.listTitle}>Chats</Text>
        </View>
        <View style={styles.toolbarSide} />
      </View>
      {menuPanelMounted ? (
        <Animated.View
          style={[
            styles.menuDropdownWrap,
            {
              opacity: menuAnim,
              transform: [
                {
                  translateY: menuAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-6, 0],
                  }),
                },
              ],
            },
          ]}
          accessibilityRole="menu"
          accessibilityLabel="Menu"
          accessibilityElementsHidden={!menuOpen}
          importantForAccessibility={menuOpen ? "yes" : "no-hide-descendants"}
        >
          <TouchableOpacity
            onPress={() => {
              setMenuOpen(false);
              performLogout();
            }}
            style={styles.menuDropdownItem}
            activeOpacity={0.7}
            accessibilityRole="menuitem"
            accessibilityLabel="Log out"
          >
            <Text style={styles.menuDropdownItemIcon} importantForAccessibility="no">
              🚪
            </Text>
            <Text style={styles.menuDropdownItemLabel}>Log out</Text>
          </TouchableOpacity>
        </Animated.View>
      ) : null}
      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          value={listQuery}
          onChangeText={setListQuery}
          placeholder="Search"
          placeholderTextColor={TG.muted}
          style={styles.searchInput}
        />
      </View>
      {sessionMode === "demo" ? (
        <View style={styles.personaRow}>
          {DEMO_USERS.map((u, i) => {
            const on = i === activeDemoIndex;
            return (
              <Pressable
                key={u.email}
                onPress={() => setActiveDemoIndex(i)}
                style={[styles.personaChip, on && styles.personaChipOn]}
              >
                <Text style={[styles.personaText, on && styles.personaTextOn]}>
                  {u.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Text style={styles.sessionHint} numberOfLines={1}>
          Signed in as {me?.email ?? ""}
        </Text>
      )}
    </View>
  );

  return (
    <>
      <Modal
        visible={newConvOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setNewConvOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setNewConvOpen(false)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New conversation</Text>
            <TextInput
              value={otherUserId}
              onChangeText={setOtherUserId}
              placeholder="Other user id"
              placeholderTextColor={TG.muted}
              autoCapitalize="none"
              style={styles.modalInput}
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setNewConvOpen(false)}
                style={({ pressed }) => [styles.modalBtnGhost, pressed && styles.modalBtnPressed]}
              >
                <Text style={styles.modalBtnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void createConversation()}
                disabled={createConvBusy || !otherUserId.trim()}
                style={({ pressed }) => [
                  styles.modalBtnPrimary,
                  (createConvBusy || !otherUserId.trim()) && styles.modalBtnPrimaryOff,
                  pressed && !(createConvBusy || !otherUserId.trim()) && styles.modalBtnPressed,
                ]}
              >
                <Text style={styles.modalBtnPrimaryText}>
                  {createConvBusy ? "Please wait…" : "Create"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
      {stack === "list" ? (
        <View style={[styles.flex, styles.listScreenHost]}>
          <View
            style={styles.listHeader}
            onLayout={(e) => setListChromeHeight(e.nativeEvent.layout.height)}
          >
            {listHeader}
          </View>
          {loadError ? <Text style={styles.errorBanner}>{loadError}</Text> : null}
          {convsLoading ? (
            <View style={styles.listLoading}>
              <ActivityIndicator color={TG.accent} />
            </View>
          ) : filteredConversations.length === 0 ? (
            <View style={styles.listLoading}>
              <Text style={styles.muted}>
                No chats yet. Run `pnpm db:seed` at the repo root.
              </Text>
            </View>
          ) : (
            <FlatList
              style={styles.listFlex}
              data={filteredConversations}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.convListContent}
              renderItem={({ item: c }) => {
                const label = conversationLabel(c, me?.id);
                const selected = c.id === conversationId;
                const subtitle =
                  c.members.length > 1
                    ? `${c.members.length} members`
                    : "Message";
                return (
                  <Pressable
                    onPress={() => openChat(c.id)}
                    style={({ pressed }) => [
                      styles.convRow,
                      selected && styles.convRowSelected,
                      !selected && pressed && styles.convRowPressed,
                      selected && pressed && styles.convRowSelectedPressed,
                    ]}
                  >
                    <View
                      style={[styles.convAvatar, selected && styles.convAvatarSelected]}
                    >
                      <Text style={styles.convAvatarText}>
                        {initialsFromLabel(label)}
                      </Text>
                    </View>
                    <View style={styles.convMid}>
                      <Text
                        style={[styles.convName, selected && styles.convNameSelected]}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                      <Text
                        style={[styles.convPreview, selected && styles.convPreviewSelected]}
                        numberOfLines={1}
                      >
                        {subtitle}
                      </Text>
                    </View>
                    <Text
                      style={[styles.convTime, selected && styles.convTimeSelected]}
                    >
                      {formatMsgTime(c.createdAt)}
                    </Text>
                  </Pressable>
                );
              }}
            />
          )}
          {token ? (
            <Pressable
              onPress={() => setNewConvOpen(true)}
              style={styles.newConvFab}
              accessibilityRole="button"
              accessibilityLabel="New conversation"
            >
              <Text style={styles.newConvFabText}>✎</Text>
            </Pressable>
          ) : null}
          {(menuOpen || menuPanelMounted) && listChromeHeight > 0 ? (
            <Pressable
              style={[
                StyleSheet.absoluteFillObject,
                styles.menuOutsideDismiss,
                { top: listChromeHeight },
              ]}
              onPress={() => setMenuOpen(false)}
              accessibilityLabel="Close menu"
              accessibilityRole="button"
            />
          ) : null}
        </View>
      ) : (
        <View style={styles.flex}>
          <View style={[styles.chatHeader, { paddingTop: topInset }]}>
            <Pressable
              onPress={() => setStack("list")}
              style={styles.backBtn}
              hitSlop={12}
            >
              <Text style={styles.backBtnText}>‹</Text>
            </Pressable>
            <View style={styles.chatAvatar}>
              <Text style={styles.chatAvatarText}>
                {initialsFromLabel(convTitle)}
              </Text>
            </View>
            <View style={styles.chatHeaderText}>
              <Text style={styles.chatTitle} numberOfLines={1}>
                {convTitle}
              </Text>
              <Text style={styles.chatSub} numberOfLines={1}>
                {socketReady ? "online" : "connecting…"}
              </Text>
            </View>
            <View style={styles.headerDotsBtn}>
              <Text style={styles.headerDots}>⋮</Text>
            </View>
          </View>
          {loadError ? <Text style={styles.errorBanner}>{loadError}</Text> : null}
          {!conversationId ? (
            <View style={styles.listLoading}>
              <Text style={styles.muted}>Pick a conversation from the list</Text>
            </View>
          ) : (
            <FlatList
              ref={msgListRef}
              style={styles.listFlex}
              data={chatRows}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              scrollEventThrottle={16}
              onScroll={handleMessageListScroll}
              onContentSizeChange={() => scrollChatToEndIfPinned(false)}
              renderItem={({ item: row }) => {
                if (row.kind === "sep") {
                  return (
                    <View style={styles.daySep}>
                      <View style={styles.dayPill}>
                        <Text style={styles.dayPillText}>{row.label}</Text>
                      </View>
                    </View>
                  );
                }
                const item = row.m;
                const mine = item.senderId === me?.id;
                const sender = conversations
                  .find((c) => c.id === item.conversationId)
                  ?.members.find((m) => m.userId === item.senderId)?.user;
                const who = sender ? displayName(sender) : item.senderId.slice(0, 6);
                const isTombstone =
                  item.deletedForEveryone || item.body === MESSAGE_DELETED_BODY;
                return (
                  <Pressable
                    delayLongPress={450}
                    onLongPress={() => setDeleteActionMessage(item)}
                  >
                    <View
                      style={[
                        styles.bubbleWrap,
                        mine ? styles.bubbleMine : styles.bubbleTheirs,
                      ]}
                    >
                      {!mine ? <Text style={styles.bubbleMeta}>{who}</Text> : null}
                      <View
                        style={[
                          styles.bubble,
                          mine ? styles.bubbleBgMine : styles.bubbleBgTheirs,
                        ]}
                      >
                        {item.attachment && !isTombstone && token ? (
                          <ChatMessageAttachmentBubble
                            attachment={item.attachment}
                            apiBase={apiBase}
                            token={token}
                            mine={mine}
                          />
                        ) : null}
                        {item.body.trim() || isTombstone ? (
                          <Text
                            style={[
                              mine ? styles.bubbleTextMine : styles.bubbleTextTheirs,
                              item.attachment && !isTombstone ? styles.bubbleTextAfterAttach : null,
                              isTombstone && styles.bubbleTextTombstone,
                            ]}
                          >
                            {item.body}
                          </Text>
                        ) : null}
                        <Text
                          style={
                            mine ? styles.bubbleTimeMine : styles.bubbleTimeTheirs
                          }
                        >
                          {formatMsgTime(item.createdAt)}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                );
              }}
            />
          )}
          {typingIndicatorText && conversationId ? (
            <View style={styles.typingLine} accessibilityLiveRegion="polite">
              <Text style={styles.typingLineText}>{typingIndicatorText}</Text>
            </View>
          ) : null}
          <View style={styles.composer}>
            {attachmentError ? (
              <Text style={styles.attachmentErrorText}>{attachmentError}</Text>
            ) : null}
            {pendingAttachment ? (
              <View style={styles.pendingAttachRow}>
                {pendingAttachment.kind === "image" ? (
                  <Image
                    source={{ uri: pendingAttachment.uri }}
                    style={styles.pendingAttachThumb}
                  />
                ) : pendingAttachment.kind === "video" ? (
                  <View style={styles.pendingVideoThumb}>
                    <Text style={styles.pendingVideoGlyph}>▶</Text>
                  </View>
                ) : (
                  <View style={styles.pendingDocThumb}>
                    <Text style={styles.pendingDocGlyph}>📄</Text>
                  </View>
                )}
                <View style={styles.pendingAttachMeta}>
                  <Text style={styles.pendingAttachName} numberOfLines={1}>
                    {pendingAttachment.name}
                  </Text>
                  <Text style={styles.pendingAttachSize}>
                    {formatFileSize(pendingAttachment.size)}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setPendingAttachment(null)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Remove attachment"
                >
                  <Text style={styles.pendingAttachRemove}>Remove</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.composerRow}>
            <View style={styles.inputRow}>
              <Pressable
                style={styles.inlineIcon}
                hitSlop={8}
                onPress={() => setEmojiOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityLabel="Open emoji picker"
                accessibilityState={{ expanded: emojiOpen }}
              >
                {({ pressed }) => (
                  <Ionicons
                    name="happy-outline"
                    size={22}
                    color={emojiOpen || pressed ? TG.accent : TG.muted}
                    importantForAccessibility="no"
                    accessibilityElementsHidden
                  />
                )}
              </Pressable>
              <TextInput
                ref={draftInputRef}
                style={[styles.input, { height: composerInputHeight }]}
                placeholder="Message"
                placeholderTextColor={TG.muted}
                editable={!composerSending}
                value={draft}
                onChangeText={setDraft}
                onBlur={() => {
                  outgoingTypingRef.current?.flushFalse();
                }}
                onSelectionChange={(e) => {
                  draftSelectionRef.current = e.nativeEvent.selection;
                }}
                onContentSizeChange={(e) => {
                  const h = e.nativeEvent.contentSize.height;
                  const next = Math.min(
                    Math.max(48, h),
                    COMPOSER_INPUT_MAX_HEIGHT,
                  );
                  setComposerInputHeight(next);
                }}
                multiline
                blurOnSubmit={false}
                returnKeyType="default"
                maxLength={2000}
              />
              <Pressable
                style={styles.inlineIcon}
                hitSlop={8}
                onPress={() => void pickAttachment()}
                disabled={!conversationId || composerSending}
                accessibilityRole="button"
                accessibilityLabel="Attach from gallery"
              >
                {({ pressed }) => (
                  <ClipBrandIcon
                    size={22}
                    color={
                      !conversationId || composerSending
                        ? TG.muted
                        : pressed
                          ? TG.accent
                          : TG.muted
                    }
                  />
                )}
              </Pressable>
            </View>
            <Pressable
              onPress={() => {
                if (draft.trim() || pendingAttachment) {
                  void send();
                }
              }}
              disabled={
                !socketReady ||
                !conversationId ||
                composerSending ||
                (!draft.trim() && !pendingAttachment)
              }
              style={({ pressed }) => [
                styles.roundSend,
                (!socketReady || !conversationId) && styles.roundSendOff,
                pressed && (draft.trim() || pendingAttachment) && styles.roundSendPressed,
              ]}
            >
              {composerSending ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.roundSendGlyph}>
                  {draft.trim() || pendingAttachment ? "➤" : "🎤"}
                </Text>
              )}
            </Pressable>
            </View>
          </View>
        </View>
      )}
      </KeyboardAvoidingView>
      <Modal
        visible={deleteActionMessage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteActionMessage(null)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setDeleteActionMessage(null)}
            accessibilityLabel="Close delete menu"
            accessibilityRole="button"
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Message</Text>
            <Pressable
              onPress={() => {
                const m = deleteActionMessage;
                if (!m) {
                  return;
                }
                setDeleteActionMessage(null);
                void deleteMessage(m.id, "for-me");
              }}
              style={({ pressed }) => [
                styles.deleteSheetRow,
                pressed && styles.modalBtnPressed,
              ]}
            >
              <Text style={styles.deleteSheetRowText}>Delete for me</Text>
            </Pressable>
            {deleteActionMessage &&
            deleteActionMessage.senderId === me?.id ? (
              <Pressable
                onPress={() => {
                  const m = deleteActionMessage;
                  if (!m) {
                    return;
                  }
                  Alert.alert(
                    "Delete for everyone",
                    "This will remove the message for all participants.",
                    [
                      { text: "Cancel", style: "cancel" },
                      {
                        text: "Delete for everyone",
                        style: "destructive",
                        onPress: () => {
                          setDeleteActionMessage(null);
                          void deleteMessage(m.id, "for-everyone");
                        },
                      },
                    ],
                  );
                }}
                style={({ pressed }) => [
                  styles.deleteSheetRow,
                  pressed && styles.modalBtnPressed,
                ]}
              >
                <Text style={styles.deleteSheetRowText}>Delete for everyone</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => setDeleteActionMessage(null)}
              style={({ pressed }) => [
                styles.deleteSheetCancel,
                pressed && styles.modalBtnPressed,
              ]}
            >
              <Text style={styles.deleteSheetCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <Modal
        visible={emojiOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setEmojiOpen(false)}
      >
        <View style={styles.emojiModalRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setEmojiOpen(false)}
            accessibilityLabel="Close emoji picker"
            accessibilityRole="button"
          />
          <View style={styles.emojiModalSheet} pointerEvents="box-none">
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              contentContainerStyle={styles.emojiScrollContent}
            >
              {EMOJI_QUICK_PICK.map((e, i) => (
                <Pressable
                  key={`${i}:${e}`}
                  style={[
                    styles.emojiCell,
                    { width: emojiCellSize, height: emojiCellSize },
                  ]}
                  onPress={() => insertEmoji(e)}
                >
                  <Text style={styles.emojiGlyph}>{e}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: TG.bg },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
    backgroundColor: TG.bg,
  },
  muted: { color: TG.muted, fontSize: 14 },
  listScreenHost: {
    position: "relative",
  },
  listHeader: {
    backgroundColor: TG.sidebar,
    zIndex: 6,
    ...(Platform.OS === "android" ? { elevation: 8 } : {}),
  },
  listHeaderTop: { paddingHorizontal: 12, paddingBottom: 10 },
  listToolbar: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    minHeight: 44,
  },
  toolbarSide: {
    width: 48,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  toolbarCenter: {
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnText: { color: TG.muted, fontSize: 22 },
  listTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: TG.text,
    textAlign: "center",
  },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#242f3d",
    borderRadius: 22,
    paddingHorizontal: 12,
    minHeight: 42,
  },
  searchIcon: { fontSize: 14, marginRight: 8, opacity: 0.7 },
  searchInput: {
    flex: 1,
    color: TG.text,
    fontSize: 15,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
  },
  personaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 12,
  },
  personaChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#242f3d",
  },
  personaChipOn: { backgroundColor: TG.accent },
  personaText: { fontSize: 13, color: TG.muted },
  personaTextOn: { color: "#fff", fontWeight: "600" },
  sessionHint: {
    marginTop: 12,
    fontSize: 13,
    color: TG.muted,
    textAlign: "center",
  },
  convListContent: { paddingBottom: 24 },
  convRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: TG.sidebar,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1f2430",
  },
  convRowSelected: { backgroundColor: TG.accent },
  convRowPressed: { backgroundColor: "#343a4a" },
  convRowSelectedPressed: { opacity: 0.92 },
  convAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#6c8eef",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  convAvatarSelected: { backgroundColor: "rgba(255,255,255,0.2)" },
  convAvatarText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  convMid: { flex: 1, minWidth: 0 },
  convName: { fontSize: 16, fontWeight: "600", color: TG.text },
  convNameSelected: { color: "#fff" },
  convPreview: { fontSize: 14, color: TG.muted, marginTop: 2 },
  convPreviewSelected: { color: "rgba(255,255,255,0.8)" },
  convTime: { minWidth: 52, color: TG.muted, fontSize: 12, textAlign: "right" },
  convTimeSelected: { color: "rgba(255,255,255,0.7)" },
  newConvFab: {
    position: "absolute",
    right: 16,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: TG.accent,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 8,
    ...(Platform.OS === "android" ? { elevation: 10 } : {}),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  newConvFabText: { color: "#fff", fontSize: 22 },
  modalRoot: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  modalCard: {
    zIndex: 2,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    backgroundColor: "#242f3d",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(135,116,225,0.35)",
  },
  modalTitle: { fontSize: 12, fontWeight: "600", color: TG.muted, textTransform: "uppercase" },
  modalInput: {
    borderRadius: 8,
    backgroundColor: "#1a2332",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#3a4555",
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 10,
    fontSize: 15,
    color: TG.text,
  },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 },
  modalBtnGhost: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  modalBtnGhostText: { color: TG.link, fontSize: 15, fontWeight: "600" },
  modalBtnPrimary: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: TG.accent,
  },
  modalBtnPrimaryOff: { opacity: 0.45 },
  modalBtnPrimaryText: { color: "#fff", fontSize: 14, fontWeight: "600" },
  modalBtnPressed: { opacity: 0.88 },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
    backgroundColor: TG.header,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#1a2836",
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 4,
  },
  backBtnText: { color: "#6d9fd5", fontSize: 32, marginTop: -4 },
  chatAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#6c8eef",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  chatAvatarText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  chatHeaderText: { flex: 1, minWidth: 0 },
  chatTitle: { fontSize: 16, fontWeight: "600", color: TG.text },
  chatSub: { fontSize: 13, color: "#6d9fd5", marginTop: 2 },
  headerDotsBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  headerDots: { color: TG.muted, fontSize: 20 },
  errorScroll: { maxHeight: "55%", width: "100%" },
  errorScrollContent: { paddingHorizontal: 8 },
  error: { color: "#ff8a8a", textAlign: "left" },
  errorBanner: {
    backgroundColor: "#3d1f24",
    color: "#ff8a8a",
    padding: 8,
    textAlign: "center",
    fontSize: 13,
  },
  listLoading: { flex: 1, justifyContent: "center", padding: 24 },
  listFlex: { flex: 1, backgroundColor: TG.bg, zIndex: 0 },
  menuOutsideDismiss: {
    zIndex: 4,
    backgroundColor: "transparent",
    ...(Platform.OS === "android" ? { elevation: 5 } : {}),
  },
  menuDropdownWrap: {
    alignSelf: "flex-start",
    maxWidth: 280,
    width: "100%",
    marginTop: 4,
    marginBottom: 4,
    borderRadius: 10,
    paddingVertical: 4,
    backgroundColor: "#222d3b",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#2f3f52",
    overflow: "hidden",
    ...(Platform.OS === "android" ? { elevation: 6 } : {}),
  },
  menuDropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  menuDropdownItemIcon: {
    width: 36,
    fontSize: 20,
    textAlign: "center",
    color: TG.muted,
  },
  menuDropdownItemLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#eb8686",
  },
  listContent: { padding: 12, paddingBottom: 20 },
  daySep: { alignItems: "center", paddingVertical: 12 },
  dayPill: {
    backgroundColor: "rgba(31, 42, 58, 0.92)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 14,
  },
  dayPillText: { color: TG.muted, fontSize: 12 },
  bubbleWrap: { marginBottom: 10, maxWidth: "88%" },
  bubbleMine: { alignSelf: "flex-end" },
  bubbleTheirs: { alignSelf: "flex-start" },
  bubbleMeta: { fontSize: 11, color: TG.muted, marginBottom: 2, marginLeft: 4 },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    maxWidth: "100%",
  },
  bubbleBgMine: { backgroundColor: TG.accent, borderBottomRightRadius: 4 },
  bubbleBgTheirs: {
    backgroundColor: TG.bubbleIn,
    borderBottomLeftRadius: 4,
  },
  bubbleTextMine: { color: "#fff", fontSize: 16 },
  bubbleTextTheirs: { color: "#e4ecf5", fontSize: 16 },
  bubbleTextTombstone: { fontStyle: "italic", opacity: 0.88 },
  bubbleTextAfterAttach: { marginTop: 6 },
  attachmentErrorText: {
    color: "#ff8a8a",
    fontSize: 12,
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  pendingAttachRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
    padding: 8,
    borderRadius: 12,
    backgroundColor: "#242f3d",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#2a3544",
  },
  pendingAttachThumb: { width: 48, height: 48, borderRadius: 8 },
  pendingVideoThumb: {
    width: 56,
    height: 40,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  pendingVideoGlyph: { color: TG.text, fontSize: 14 },
  pendingDocThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  pendingDocGlyph: { fontSize: 22 },
  pendingAttachMeta: { flex: 1, minWidth: 0 },
  pendingAttachName: { color: TG.text, fontSize: 13 },
  pendingAttachSize: { color: TG.muted, fontSize: 11, marginTop: 2 },
  pendingAttachRemove: { color: "#ff8a8a", fontSize: 13 },
  deleteSheetRow: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#2f3f52",
  },
  deleteSheetRowText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#eb8686",
  },
  deleteSheetCancel: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  deleteSheetCancelText: {
    fontSize: 16,
    color: TG.link,
    textAlign: "center",
    fontWeight: "600",
  },
  bubbleTimeMine: {
    fontSize: 11,
    color: "rgba(255,255,255,0.65)",
    textAlign: "right",
    marginTop: 4,
  },
  bubbleTimeTheirs: {
    fontSize: 11,
    color: "#8eb4e0",
    textAlign: "right",
    marginTop: 4,
  },
  typingLine: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 2,
    backgroundColor: TG.bg,
  },
  typingLineText: {
    fontSize: 12,
    color: TG.muted,
  },
  composer: {
    flexDirection: "column",
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 22 : 12,
    backgroundColor: TG.header,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#1a2836",
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  inputRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: "#242f3d",
    borderRadius: 24,
    paddingLeft: 4,
    paddingRight: 4,
    minHeight: 48,
    maxHeight: COMPOSER_INPUT_MAX_HEIGHT + 12,
  },
  inlineIcon: {
    width: 40,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  inlineIconText: { fontSize: 18, opacity: 0.85 },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: COMPOSER_INPUT_MAX_HEIGHT,
    paddingVertical: 12,
    fontSize: 16,
    color: TG.text,
    textAlignVertical: "top",
  },
  roundSend: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: TG.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  roundSendOff: { opacity: 0.45 },
  roundSendPressed: { opacity: 0.88 },
  roundSendGlyph: { color: "#fff", fontSize: 18 },
  emojiModalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  emojiModalSheet: {
    maxHeight: 280,
    backgroundColor: "#242f3d",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#3a4555",
    paddingBottom: Platform.OS === "ios" ? 28 : 14,
  },
  emojiScrollContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 4,
  },
  emojiCell: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  emojiGlyph: { fontSize: 26 },
});
