import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { ClipBrandBadge } from "./components/clip-brand-icon";

const TG = {
  outer: "#0b121a",
  bg: "#0e1621",
  panel: "#242f3d",
  accent: "#8774e1",
  text: "#e4e6eb",
  muted: "#8b92a0",
  link: "#6d9fd5",
  border: "rgba(255,255,255,0.1)",
} as const;

type Me = { id: string; email: string; name: string | null };

export type AuthGateProps = {
  apiBase: string;
  onJwtSession: (token: string, user: Me) => void;
  onDemo: () => void;
};

function formatApiError(status: number, bodyText: string): string {
  try {
    const parsed = JSON.parse(bodyText) as {
      message?: string | string[];
    };
    if (Array.isArray(parsed.message)) {
      return parsed.message.join("\n");
    }
    if (typeof parsed.message === "string") {
      return parsed.message;
    }
  } catch {
    // not JSON
  }
  const trimmed = bodyText.trim();
  return trimmed.length > 0 ? trimmed : `Request failed (${status})`;
}

type Tab = "register" | "login";

export function AuthGate({ apiBase, onJwtSession, onDemo }: AuthGateProps) {
  const [tab, setTab] = useState<Tab>("register");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitRegister = async () => {
    setError(null);
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim() || undefined,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        setError(formatApiError(res.status, text));
        return;
      }
      const data = JSON.parse(text) as {
        accessToken: string;
        user: Me;
      };
      onJwtSession(data.accessToken, data.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const submitLogin = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const text = await res.text();
      if (!res.ok) {
        setError(formatApiError(res.status, text));
        return;
      }
      const data = JSON.parse(text) as {
        accessToken: string;
        user: Me;
      };
      onJwtSession(data.accessToken, data.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.outer}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <View style={styles.brandRow}>
            <ClipBrandBadge size={52} />
          </View>
          <Text style={styles.title}>
            {tab === "register" ? "Create account" : "Sign in"}
          </Text>
          <Text style={styles.sub}>
            Connect to the API or try demo mode
          </Text>

          <View style={styles.tabs}>
            <Pressable
              onPress={() => {
                setTab("register");
                setError(null);
              }}
              style={[styles.tab, tab === "register" && styles.tabOn]}
            >
              <Text style={[styles.tabText, tab === "register" && styles.tabTextOn]}>
                Sign up
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setTab("login");
                setError(null);
              }}
              style={[styles.tab, tab === "login" && styles.tabOn]}
            >
              <Text style={[styles.tabText, tab === "login" && styles.tabTextOn]}>
                Sign in
              </Text>
            </Pressable>
          </View>

          {tab === "register" ? (
            <View style={styles.form}>
              <Field
                label="Name (optional)"
                value={name}
                onChangeText={setName}
                placeholder="e.g. Jane"
                autoCapitalize="words"
              />
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                secureTextEntry
              />
              <Field
                label="Confirm password"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
              />
              <Pressable
                onPress={() => void submitRegister()}
                disabled={busy}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  busy && styles.primaryBtnOff,
                  pressed && !busy && styles.primaryBtnPressed,
                ]}
              >
                <Text style={styles.primaryBtnText}>
                  {busy ? "Please wait…" : "Create account"}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.form}>
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
              <Pressable
                onPress={() => void submitLogin()}
                disabled={busy}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  busy && styles.primaryBtnOff,
                  pressed && !busy && styles.primaryBtnPressed,
                ]}
              >
                <Text style={styles.primaryBtnText}>
                  {busy ? "Please wait…" : "Sign in"}
                </Text>
              </Pressable>
            </View>
          )}

          {error ? (
            <Text style={styles.error} selectable>
              {error}
            </Text>
          ) : null}

          <Pressable
            onPress={onDemo}
            style={({ pressed }) => [styles.demoBtn, pressed && styles.demoBtnPressed]}
          >
            <Text style={styles.demoBtnText}>Demo (Alice / Bob / Caro)</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address";
  autoCapitalize?: "none" | "words";
}) {
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={TG.muted}
        secureTextEntry={props.secureTextEntry}
        keyboardType={props.keyboardType}
        autoCapitalize={props.autoCapitalize}
        style={fieldStyles.input}
      />
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  wrap: { gap: 6 },
  label: { fontSize: 12, fontWeight: "600", color: TG.muted, textTransform: "uppercase" },
  input: {
    backgroundColor: TG.panel,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TG.border,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    fontSize: 16,
    color: TG.text,
  },
});

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: TG.outer },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 32,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    backgroundColor: TG.bg,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TG.border,
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 16,
  },
  brandRow: { alignItems: "center" },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: TG.text,
    textAlign: "center",
  },
  sub: { fontSize: 14, color: TG.muted, textAlign: "center", marginBottom: 8 },
  tabs: { flexDirection: "row", gap: 10, marginBottom: 8 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: TG.panel,
    alignItems: "center",
  },
  tabOn: { backgroundColor: TG.accent },
  tabText: { fontSize: 15, fontWeight: "600", color: TG.muted },
  tabTextOn: { color: "#fff" },
  form: { gap: 14 },
  primaryBtn: {
    marginTop: 6,
    backgroundColor: TG.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnOff: { opacity: 0.5 },
  primaryBtnPressed: { opacity: 0.9 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  error: {
    color: "#ff8a8a",
    textAlign: "center",
    fontSize: 14,
    marginTop: 4,
  },
  demoBtn: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: TG.link,
    alignItems: "center",
  },
  demoBtnPressed: { opacity: 0.85 },
  demoBtnText: { color: TG.link, fontSize: 15, fontWeight: "600" },
});
