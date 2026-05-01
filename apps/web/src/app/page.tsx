import { MessengerClient } from "@/components/messenger-client";

export default function Home() {
  return (
    <main className="min-h-screen p-8 mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">App messenger</h1>
      <MessengerClient />
    </main>
  );
}
