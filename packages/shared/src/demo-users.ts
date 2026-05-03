/** Seeded demo accounts — keep in sync with `apps/api/prisma/seed.cjs` */
/** Password must satisfy API `LoginDto` @MinLength(8) */
export const DEMO_PASSWORD = "demo1234";

export const DEMO_USERS = [
  { email: "alice@demo.local", label: "Alice" },
  { email: "bob@demo.local", label: "Bob" },
  { email: "caro@demo.local", label: "Caro" },
] as const;
