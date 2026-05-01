import {
  SocketEvents,
  type MessageNewPayload,
  type MessageSendPayload,
} from "@app-messenger/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { io, type Socket } from "socket.io-client";
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

export function MessengerRoot() {
  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [activeDemoIndex, setActiveDemoIndex] = useState(0);
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [convsLoading, setConvsLoading] = useState(false);
  const [socketReady, setSocketReady] = useState(false);
  const listRef = useRef<FlatList<MessageRow>>(null);
  const socketRef = useRef<Socket | null>(null);

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
    let cancelled = false;
    (async () => {
      setBooting(true);
      setToken(null);
      setMe(null);
      setConversationId(null);
      setMessages([]);
      setConversations([]);
      setLoadError(null);
      try {
        const u = DEMO_USERS[activeDemoIndex];
        await loginAs(u.email);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Login failed");
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
  }, [activeDemoIndex, loginAs]);

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

  if (booting) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        <Text style={styles.muted}>Բացում…</Text>
      </View>
    );
  }

  if (loadError && !token) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{loadError}</Text>
        <Text style={styles.muted}>
          Ավելացրու seed՝ `pnpm db:seed` (repo root)
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{convTitle}</Text>
        <Text style={styles.mutedSmall}>
          {socketReady ? "Ակտիվ կապ" : "Socket…"} · {apiBase}
        </Text>
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
      </View>

      {conversations.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.convScroll}
        >
          {conversations.map((c) => {
            const on = c.id === conversationId;
            return (
              <Pressable
                key={c.id}
                onPress={() => setConversationId(c.id)}
                style={[styles.convChip, on && styles.convChipOn]}
              >
                <Text
                  style={[styles.convChipText, on && styles.convChipTextOn]}
                  numberOfLines={1}
                >
                  {conversationLabel(c, me?.id)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {loadError ? (
        <Text style={styles.errorBanner}>{loadError}</Text>
      ) : null}

      {convsLoading ? (
        <View style={styles.listLoading}>
          <ActivityIndicator />
        </View>
      ) : !conversationId ? (
        <View style={styles.listLoading}>
          <Text style={styles.muted}>Զրուցարան չկա։ Գործարկիր `pnpm db:seed`</Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          style={styles.listFlex}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() =>
            listRef.current?.scrollToEnd({ animated: true })
          }
          renderItem={({ item }) => {
            const mine = item.senderId === me?.id;
            const sender = conversations
              .find((c) => c.id === item.conversationId)
              ?.members.find((m) => m.userId === item.senderId)?.user;
            const who = sender
              ? displayName(sender)
              : item.senderId.slice(0, 6);
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
                    style={mine ? styles.bubbleTextMine : styles.bubbleTextTheirs}
                  >
                    {item.body}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          placeholder="Հաղորդագրություն…"
          placeholderTextColor="#888"
          value={draft}
          onChangeText={setDraft}
          multiline
          maxLength={2000}
        />
        <Pressable
          onPress={send}
          disabled={!socketReady}
          style={({ pressed }) => [
            styles.sendBtn,
            !socketReady && styles.sendBtnDisabled,
            pressed && socketReady && styles.sendBtnPressed,
          ]}
        >
          <Text style={styles.sendBtnText}>Ուղարկել</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#f0f2f5" },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  header: {
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#111" },
  muted: { color: "#666", fontSize: 14 },
  mutedSmall: { color: "#888", fontSize: 11, marginTop: 4 },
  personaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  personaChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#eee",
  },
  personaChipOn: { backgroundColor: "#0a7ea4" },
  personaText: { fontSize: 13, color: "#333" },
  personaTextOn: { color: "#fff", fontWeight: "600" },
  convScroll: {
    flexGrow: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#e8eaed",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ccc",
  },
  convChip: {
    maxWidth: 200,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 14,
    backgroundColor: "#fff",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#ccc",
  },
  convChipOn: {
    backgroundColor: "#0a7ea4",
    borderColor: "#0a7ea4",
  },
  convChipText: { fontSize: 13, color: "#333" },
  convChipTextOn: { color: "#fff", fontWeight: "600" },
  error: { color: "#b00020", textAlign: "center" },
  errorBanner: {
    backgroundColor: "#ffebee",
    color: "#b00020",
    padding: 8,
    textAlign: "center",
    fontSize: 13,
  },
  listLoading: { flex: 1, justifyContent: "center", padding: 24 },
  listFlex: { flex: 1 },
  listContent: { padding: 12, paddingBottom: 20 },
  bubbleWrap: { marginBottom: 10, maxWidth: "88%" },
  bubbleMine: { alignSelf: "flex-end" },
  bubbleTheirs: { alignSelf: "flex-start" },
  bubbleMeta: { fontSize: 11, color: "#666", marginBottom: 2, marginLeft: 4 },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bubbleBgMine: { backgroundColor: "#0a7ea4" },
  bubbleBgTheirs: { backgroundColor: "#fff", borderWidth: StyleSheet.hairlineWidth, borderColor: "#e0e0e0" },
  bubbleTextMine: { color: "#fff", fontSize: 16 },
  bubbleTextTheirs: { color: "#111", fontSize: 16 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 10,
    paddingBottom: Platform.OS === "ios" ? 24 : 12,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#ddd",
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "#fafafa",
  },
  sendBtn: {
    backgroundColor: "#0a7ea4",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  sendBtnPressed: { opacity: 0.85 },
  sendBtnDisabled: { backgroundColor: "#9bbcc6" },
  sendBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
});
