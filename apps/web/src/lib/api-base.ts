export function getApiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) {
    return "http://localhost:4000";
  }
  return url.replace(/\/$/, "");
}
