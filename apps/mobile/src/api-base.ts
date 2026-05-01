import Constants from "expo-constants";
import { Platform } from "react-native";

const API_PORT = 4000;

/**
 * Nest API base URL for REST and Socket.IO.
 * In dev, prefers `EXPO_PUBLIC_API_URL`, then Expo dev host (LAN IP on a physical device).
 */
export function getApiBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }

  if (!__DEV__) {
    throw new Error(
      "Set EXPO_PUBLIC_API_URL in apps/mobile/.env for production builds.",
    );
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    let host = hostUri.split(":")[0]?.trim();
    if (host) {
      if (
        Platform.OS === "android" &&
        (host === "localhost" || host === "127.0.0.1")
      ) {
        host = "10.0.2.2";
      }
      return `http://${host}:${API_PORT}`;
    }
  }

  if (Platform.OS === "android") {
    return `http://10.0.2.2:${API_PORT}`;
  }

  return `http://localhost:${API_PORT}`;
}
