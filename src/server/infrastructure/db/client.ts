import postgres from "postgres";
import { getDatabaseUrl } from "@/server/infrastructure/config/app-config";

type SqlClient = postgres.Sql<Record<string, unknown>>;

declare global {
  // eslint-disable-next-line no-var
  var __bendySql: SqlClient | undefined;
}

function createClient(): SqlClient {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured. Copy .env.example to .env before starting the app.");
  }

  return postgres(databaseUrl, {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 30,
    prepare: false
  });
}

const rawSql: SqlClient = global.__bendySql ?? createClient();

if (process.env.NODE_ENV !== "production") {
  global.__bendySql = rawSql;
}

const TRANSIENT_MESSAGES = [
  "socket disconnected",
  "TLS connection was not established",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "read ECONNRESET",
  "write ECONNRESET",
  "Connection terminated unexpectedly",
];

function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  return TRANSIENT_MESSAGES.some((t) => msg.includes(t));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Wrap the sql tagged-template with automatic retry on transient network errors.
// The proxy forwards property access (e.g. sql.begin, sql.reserve) to the raw client
// so that transactions and other advanced features still work.
const sql = new Proxy(rawSql, {
  apply(target, thisArg, args: [TemplateStringsArray, ...unknown[]]) {
    return (async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return await Reflect.apply(target, thisArg, args);
        } catch (err) {
          if (isTransientError(err) && attempt < 2) {
            await sleep(500 * (attempt + 1));
            continue;
          }
          throw err;
        }
      }
    })();
  },
  get(target, prop, receiver) {
    const value = Reflect.get(target, prop, receiver);
    if (typeof value === "function") {
      // Bind methods like .begin(), .reserve() etc. to the raw client
      return value.bind(target);
    }
    return value;
  }
}) as unknown as SqlClient;

export default sql;
