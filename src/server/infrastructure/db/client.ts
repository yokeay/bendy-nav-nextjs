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

const sql: SqlClient = global.__bendySql ?? createClient();

if (process.env.NODE_ENV !== "production") {
  global.__bendySql = sql;
}

export default sql;
