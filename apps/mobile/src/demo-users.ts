/** Seeded demo accounts — see `apps/api/prisma/seed.cjs` */
/** Must match API `LoginDto` @MinLength(8) and `apps/api/prisma/seed.cjs` */
export const DEMO_PASSWORD = "demo1234";

export const DEMO_USERS = [
  { email: "alice@demo.local", label: "Alice" },
  { email: "bob@demo.local", label: "Bob" },
  { email: "caro@demo.local", label: "Caro" },
] as const;
