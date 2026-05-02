import Constants from "expo-constants";
import { Platform } from "react-native";

const API_PORT = 4000;

function isLoopbackApiUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

/** Tunnel / edge hosts where Metro hostname must not be reused for the Nest port. */
function isUnsuitableDevApiHost(host: string): boolean {
  const lower = host.toLowerCase();
  return lower.includes("exp.direct") || lower.includes("ngrok");
}

/**
 * Nest API base URL for REST and Socket.IO.
 * In dev, prefers `EXPO_PUBLIC_API_URL`, then monorepo `NEXT_PUBLIC_API_URL`, then Expo dev host.
 * Physical device: if env is still `localhost` but Metro is opened via LAN, same machine IP is used for :4000.
 */
export function getApiBaseUrl(): string {
  const fromEnv =
    process.env.EXPO_PUBLIC_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_URL?.trim();

  const hostUri = Constants.expoConfig?.hostUri;
  const metroHost = hostUri?.split(":")[0]?.trim();

  if (
    __DEV__ &&
    Platform.OS !== "web" &&
    fromEnv &&
    isLoopbackApiUrl(fromEnv) &&
    metroHost &&
    !isUnsuitableDevApiHost(metroHost) &&
    metroHost !== "localhost" &&
    metroHost !== "127.0.0.1"
  ) {
    return `http://${metroHost}:${API_PORT}`;
  }

  if (fromEnv) {
    return fromEnv.replace(/\/$/, "");
  }

  if (!__DEV__) {
    throw new Error(
      "Set EXPO_PUBLIC_API_URL in the repository root `.env` for production builds.",
    );
  }

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
