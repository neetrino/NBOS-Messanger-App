const TOKEN_KEY = "app_messenger_token";
const USER_KEY = "app_messenger_user";

export type StoredAuthUser = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
};

export function persistWebSession(token: string, user: StoredAuthUser): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function readWebSession(): {
  token: string;
  user: StoredAuthUser;
} | null {
  if (typeof window === "undefined") {
    return null;
  }
  const token = sessionStorage.getItem(TOKEN_KEY);
  const raw = sessionStorage.getItem(USER_KEY);
  if (!token || !raw) {
    return null;
  }
  try {
    const user = JSON.parse(raw) as StoredAuthUser;
    if (
      typeof user?.id === "string" &&
      typeof user?.email === "string" &&
      "name" in user &&
      typeof user?.createdAt === "string"
    ) {
      return { token, user };
    }
  } catch {
    // invalid JSON
  }
  return null;
}

export function clearWebSession(): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}
