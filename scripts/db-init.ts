import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { getDatabaseUrl } from "../src/server/infrastructure/config/app-config";

async function run(): Promise<void> {
  const databaseUrl = getDatabaseUrl();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not configured. Copy .env.example to .env and fill in the database connection first.");
  }

  const sql = postgres(databaseUrl, { prepare: false, max: 1 });
  try {
    const schemaPath = path.join(process.cwd(), "scripts", "sql", "schema.sql");
    const seedPath = path.join(process.cwd(), "scripts", "sql", "seed.sql");

    const schemaSql = await readFile(schemaPath, "utf8");
    const seedSql = await readFile(seedPath, "utf8");

    await sql.unsafe(schemaSql);
    await sql.unsafe(seedSql);
    console.log("Database initialized successfully.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

run().catch((error: unknown) => {
  console.error("db:init failed", error);
  process.exit(1);
});
