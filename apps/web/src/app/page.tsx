import { MessengerClient } from "@/components/messenger-client";

export default function Home() {
  return (
    <main className="min-h-dvh flex flex-col items-stretch justify-center bg-[#0b121a] px-3 py-4 md:px-6">
      <MessengerClient />
    </main>
  );
}
