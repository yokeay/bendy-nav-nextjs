import { PrismaClient, Prisma } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __bendyPrisma: PrismaClient | undefined;
}

function buildPrismaUrl(): string {
  const raw = process.env.DATABASE_URL ?? "";
  try {
    const u = new URL(raw);
    u.searchParams.delete("channel_binding");
    u.searchParams.set("connection_limit", String(u.searchParams.get("connection_limit") ?? 5));
    u.searchParams.set("pool_timeout", String(u.searchParams.get("pool_timeout") ?? 20));
    // Neon from high-latency networks: give more time for the initial handshake.
    const existingTimeout = u.searchParams.get("connect_timeout");
    if (!existingTimeout || Number(existingTimeout) < 30) {
      u.searchParams.set("connect_timeout", "30");
    }
    return u.toString();
  } catch {
    return raw;
  }
}

const TRANSIENT_CODES = new Set(["P1001", "P1002", "P1008", "P1011"]);

function isTransient(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code) {
    return TRANSIENT_CODES.has(err.code);
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function createClient(): PrismaClient {
  const base = new PrismaClient({
    datasources: { db: { url: buildPrismaUrl() } },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

  return base.$extends({
    query: {
      async $allOperations({ args, query }) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            return await query(args);
          } catch (err) {
            if (isTransient(err) && attempt < 2) {
              await sleep(500 * (attempt + 1));
              continue;
            }
            throw err;
          }
        }
      }
    }
  }) as unknown as PrismaClient;
}

const prisma: PrismaClient = global.__bendyPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  global.__bendyPrisma = prisma;
}

export default prisma;
