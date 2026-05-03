import { MessengerClient } from "@/components/messenger-client";

export default function Home() {
  return (
    <main className="flex min-h-dvh w-full min-w-0 flex-col bg-[#0b121a] px-3 py-4 md:h-dvh md:px-0 md:py-0">
      <MessengerClient />
    </main>
  );
}
