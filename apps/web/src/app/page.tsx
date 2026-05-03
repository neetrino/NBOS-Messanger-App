import { MessengerClient } from "@/components/messenger-client";

export default function Home() {
  return (
    <main className="flex min-h-0 w-full min-w-0 flex-col overflow-x-hidden bg-[#0b121a] px-0 py-0 max-md:h-dvh max-md:overflow-hidden sm:px-3 sm:py-4 md:min-h-dvh md:h-dvh md:overflow-visible md:px-0 md:py-0">
      <MessengerClient />
    </main>
  );
}
