"use client";

import { getApiBaseUrl } from "@/lib/api-base";
import { persistWebSession } from "@/lib/session-storage";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

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

export function LoginPage() {
  const apiBase = useMemo(() => getApiBaseUrl(), []);
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        user: {
          id: string;
          email: string;
          name: string | null;
          createdAt: string;
        };
      };
      persistWebSession(data.accessToken, data.user);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Սխալ է տեղի ունեցել։");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center bg-[#0b121a] px-4 py-8">
      <div className="w-full max-w-[420px] rounded-2xl border border-white/10 bg-[#0e1621] p-6 shadow-xl md:p-8">
        <h1 className="text-center text-xl font-semibold text-[#e4e6eb] md:text-2xl">
          Մուտք գործել
        </h1>
        <p className="mt-2 text-center text-sm text-[#8b92a0]">
          Մուտքագրեք ձեր տվյալները
        </p>

        <form className="mt-8 flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-[#8b92a0]">
              Էլ․ փոստ
            </span>
            <input
              className="rounded-xl border border-white/10 bg-[#242f3d] px-4 py-3 text-[15px] text-[#e4e6eb] outline-none ring-[#8774e1] placeholder:text-[#6b7280] focus:ring-2"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-[#8b92a0]">
              Գաղտնաբառ
            </span>
            <input
              className="rounded-xl border border-white/10 bg-[#242f3d] px-4 py-3 text-[15px] text-[#e4e6eb] outline-none ring-[#8774e1] placeholder:text-[#6b7280] focus:ring-2"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
            />
          </label>

          {error ? (
            <p className="whitespace-pre-wrap rounded-lg bg-[#3d1f24] px-3 py-2 text-center text-[13px] text-[#ff8a8a]">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="mt-2 rounded-xl bg-[#8774e1] py-3.5 text-[15px] font-semibold text-white transition-opacity disabled:opacity-50"
          >
            {busy ? "Սպասեք…" : "Մուտք"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#8b92a0]">
          Հաշիվ չունե՞ք։{" "}
          <Link className="font-medium text-[#6d9fd5] hover:underline" href="/register">
            Գրանցվել
          </Link>
        </p>
        <p className="mt-3 text-center text-sm text-[#8b92a0]">
          <Link className="text-[#6d9fd5] hover:underline" href="/">
            ← Չաթ
          </Link>
        </p>
      </div>
    </main>
  );
}

export default LoginPage;
