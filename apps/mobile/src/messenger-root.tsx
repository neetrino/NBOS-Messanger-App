import {
  SocketEvents,
  type MessageNewPayload,
  type MessageSendPayload,
} from "@app-messenger/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { io, type Socket } from "socket.io-client";
import { AuthGate } from "./auth-gate";
import { getApiBaseUrl } from "./api-base";
import { DEMO_PASSWORD, DEMO_USERS } from "./demo-users";

type Me = { id: string; email: string; name: string | null };
type MemberUser = { id: string; email: string; name: string | null };
type ConversationRow = {
  id: string;
  title: string | null;
  members: Array<{ userId: string; user: MemberUser }>;
};
type MessageRow = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
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
    `Հեռախոսը չի հասնում API-ին (${apiBase})։`,
    "• PC-ն և հեռախոսը նույն Wi‑Fi ցանցում արա",
    "• repository root `.env` — EXPO_PUBLIC_API_URL=http://<PC_WiFi_IP>:4000",
    "  (Windows՝ ipconfig → Wireless LAN IPv4)",
    "• Կամ repo/apps/mobile-ում՝ pnpm dev:tunnel",
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
  header: "#212d3b",
  accent: "#8774e1",
  bubbleIn: "#2b5278",
  text: "#e4e6eb",
  muted: "#8b92a0",
} as const;

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [booting, setBooting] = useState(false);
  const [convsLoading, setConvsLoading] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const [stack, setStack] = useState<"list" | "chat">("list");
  const [listQuery, setListQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPanelMounted, setMenuPanelMounted] = useState(false);
  const menuAnim = useRef(new Animated.Value(0)).current;
  const [listChromeHeight, setListChromeHeight] = useState(0);
  const msgListRef = useRef<FlatList<ChatListRow>>(null);
  const socketRef = useRef<Socket | null>(null);

  const performLogout = useCallback(() => {
    const s = socketRef.current;
    if (s) {
      s.removeAllListeners();
      s.disconnect();
      socketRef.current = null;
    }
    setSocketReady(false);
    setMenuOpen(false);
    setMenuPanelMounted(false);
    menuAnim.setValue(0);
    setToken(null);
    setMe(null);
    setConversations([]);
    setConversationId(null);
    setMessages([]);
    setDraft("");
    setListQuery("");
    setLoadError(null);
    setStack("list");
    setActiveDemoIndex(0);
    setSessionMode("gate");
  }, []);

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
    const s = io(apiBase, {
      transports: ["websocket", "polling"],
      auth: { token },
    });
    socketRef.current = s;
    setSocketReady(s.connected);
    const onConnect = () => {
      setSocketReady(true);
      s.emit(SocketEvents.JOIN_CONVERSATION, { conversationId });
    };
    const onDisconnect = () => {
      setSocketReady(false);
    };
    const onMsg = (payload: MessageNewPayload) => {
      if (payload.conversationId !== conversationId) {
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
        };
        return [...prev, next];
      });
    };
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    s.on(SocketEvents.MESSAGE_NEW, onMsg);
    return () => {
      setSocketReady(false);
      s.removeAllListeners();
      s.disconnect();
      socketRef.current = null;
    };
  }, [apiBase, conversationId, token]);

  const send = useCallback(() => {
    const s = socketRef.current;
    const body = draft.trim();
    if (!socketReady || !s?.connected || !conversationId || !body) {
      return;
    }
    const payload: MessageSendPayload = { conversationId, body };
    s.emit(SocketEvents.MESSAGE_SEND, payload);
    setDraft("");
  }, [conversationId, draft, socketReady]);

  const convTitle = useMemo(() => {
    const c = conversations.find((x) => x.id === conversationId);
    return c ? conversationLabel(c, me?.id) : "Chat";
  }, [conversationId, conversations, me?.id]);

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
        <Text style={styles.muted}>Բացում…</Text>
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
            Ավելացրու seed՝ `pnpm db:seed` (repo root)
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
            accessibilityLabel="Դուրս գալ"
          >
            <Text style={styles.menuDropdownItemIcon} importantForAccessibility="no">
              🚪
            </Text>
            <Text style={styles.menuDropdownItemLabel}>Դուրս գալ</Text>
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
          {me?.email ?? ""}
        </Text>
      )}
    </View>
  );

  return (
    <>
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
                Զրուցարան չկա։ Գործարկիր `pnpm db:seed`
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
                const subtitle =
                  c.members.length > 1
                    ? `${c.members.length} members`
                    : "Message";
                return (
                  <Pressable
                    onPress={() => openChat(c.id)}
                    style={({ pressed }) => [
                      styles.convRow,
                      pressed && styles.convRowPressed,
                    ]}
                  >
                    <View style={styles.convAvatar}>
                      <Text style={styles.convAvatarText}>
                        {initialsFromLabel(label)}
                      </Text>
                    </View>
                    <View style={styles.convMid}>
                      <Text style={styles.convName} numberOfLines={1}>
                        {label}
                      </Text>
                      <Text style={styles.convPreview} numberOfLines={1}>
                        {subtitle}
                      </Text>
                    </View>
                    <Text style={styles.convTime}> </Text>
                  </Pressable>
                );
              }}
            />
          )}
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
              <Text style={styles.muted}>No chat</Text>
            </View>
          ) : (
            <FlatList
              ref={msgListRef}
              style={styles.listFlex}
              data={chatRows}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
              onContentSizeChange={() =>
                msgListRef.current?.scrollToEnd({ animated: true })
              }
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
                return (
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
                      <Text
                        style={
                          mine ? styles.bubbleTextMine : styles.bubbleTextTheirs
                        }
                      >
                        {item.body}
                      </Text>
                      <Text
                        style={
                          mine ? styles.bubbleTimeMine : styles.bubbleTimeTheirs
                        }
                      >
                        {formatMsgTime(item.createdAt)}
                      </Text>
                    </View>
                  </View>
                );
              }}
            />
          )}
          <View style={styles.composer}>
            <View style={styles.inputRow}>
              <Pressable style={styles.inlineIcon} hitSlop={8}>
                <Text style={styles.inlineIconText}>🙂</Text>
              </Pressable>
              <TextInput
                style={styles.input}
                placeholder="Message"
                placeholderTextColor={TG.muted}
                value={draft}
                onChangeText={setDraft}
                multiline
                maxLength={2000}
              />
              <Pressable style={styles.inlineIcon} hitSlop={8}>
                <Text style={styles.inlineIconText}>📎</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => {
                if (draft.trim()) {
                  send();
                }
              }}
              disabled={!socketReady || !conversationId}
              style={({ pressed }) => [
                styles.roundSend,
                (!socketReady || !conversationId) && styles.roundSendOff,
                pressed && draft.trim() && styles.roundSendPressed,
              ]}
            >
              <Text style={styles.roundSendGlyph}>
                {draft.trim() ? "➤" : "🎤"}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
      </KeyboardAvoidingView>
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
  convRowPressed: { backgroundColor: "#343a4a" },
  convAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#6c8eef",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  convAvatarText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  convMid: { flex: 1, minWidth: 0 },
  convName: { fontSize: 16, fontWeight: "600", color: TG.text },
  convPreview: { fontSize: 14, color: TG.muted, marginTop: 2 },
  convTime: { width: 8, color: TG.muted, fontSize: 12 },
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
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: Platform.OS === "ios" ? 22 : 12,
    backgroundColor: TG.header,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#1a2836",
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
    maxHeight: 120,
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
    maxHeight: 120,
    paddingVertical: 12,
    fontSize: 16,
    color: TG.text,
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
});
