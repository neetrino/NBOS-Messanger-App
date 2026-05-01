import {
  SocketEvents,
  type MessageNewPayload,
  type MessageSendPayload,
} from "@app-messenger/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { io, type Socket } from "socket.io-client";

function getApiBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv.replace(/\/$/, "");
  }
  return "http://localhost:4000";
}

export function MessengerRoot() {
  const apiBase = useMemo(() => getApiBase(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [socket, setSocket] = useState<Socket | null>(null);

  const pushLog = useCallback((line: string) => {
    setLog((prev) => [...prev.slice(-80), line]);
  }, []);

  const login = useCallback(async () => {
    const res = await fetch(`${apiBase}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      pushLog(`login failed: ${await res.text()}`);
      return;
    }
    const data = (await res.json()) as {
      accessToken: string;
      user: { id: string };
    };
    setToken(data.accessToken);
    setUserId(data.user.id);
    pushLog("logged in");
  }, [apiBase, email, password, pushLog]);

  useEffect(() => {
    if (!token || !conversationId.trim()) {
      return;
    }
    const s = io(apiBase, {
      transports: ["websocket", "polling"],
      auth: { token },
    });
    setSocket(s);
    s.on("connect", () => {
      pushLog("socket connected");
      s.emit(SocketEvents.JOIN_CONVERSATION, {
        conversationId: conversationId.trim(),
      });
    });
    s.on(SocketEvents.MESSAGE_NEW, (payload: MessageNewPayload) => {
      pushLog(`msg ${payload.senderId.slice(0, 6)}: ${payload.body}`);
    });
    return () => {
      s.removeAllListeners();
      s.disconnect();
      setSocket(null);
    };
  }, [apiBase, conversationId, pushLog, token]);

  const send = useCallback(() => {
    if (!socket?.connected || !conversationId.trim() || !draft.trim()) {
      return;
    }
    const payload: MessageSendPayload = {
      conversationId: conversationId.trim(),
      body: draft.trim(),
    };
    socket.emit(SocketEvents.MESSAGE_SEND, payload);
    setDraft("");
  }, [conversationId, draft, socket]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Messenger (Expo)</Text>
      <Text style={styles.muted}>API: {apiBase}</Text>
      {userId ? <Text>user: {userId}</Text> : null}
      <TextInput
        style={styles.input}
        placeholder="email"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <Button title="Login" onPress={() => void login()} />
      <TextInput
        style={styles.input}
        placeholder="conversation id"
        value={conversationId}
        onChangeText={setConversationId}
      />
      <TextInput
        style={styles.input}
        placeholder="message"
        value={draft}
        onChangeText={setDraft}
      />
      <Button title="Send" onPress={send} />
      <View style={styles.logBox}>
        {log.map((line, i) => (
          <Text key={`${i}-${line}`} style={styles.logLine}>
            {line}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  title: { fontSize: 20, fontWeight: "600" },
  muted: { color: "#666", fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  logBox: { marginTop: 12, gap: 4 },
  logLine: { fontSize: 12, fontFamily: "monospace" },
});
