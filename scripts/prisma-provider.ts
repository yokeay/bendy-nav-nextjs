// Rewrites prisma/schema.prisma datasource provider to match DATABASE_PROVIDER env.
// Run before any `prisma generate|migrate|db push` when supporting dual DBs.
import { promises as fs } from "node:fs";
import path from "node:path";

const SCHEMA_PATH = path.resolve(process.cwd(), "prisma/schema.prisma");
const SUPPORTED = new Set(["postgresql", "sqlite"]);

async function main() {
  const raw = (process.env.DATABASE_PROVIDER ?? "postgresql").toLowerCase();
  if (!SUPPORTED.has(raw)) {
    throw new Error(`Unsupported DATABASE_PROVIDER=${raw}. Use postgresql or sqlite.`);
  }
  const content = await fs.readFile(SCHEMA_PATH, "utf8");
  const next = content.replace(/provider\s*=\s*"(postgresql|sqlite)"/, `provider = "${raw}"`);
  if (next === content) {
    return;
  }
  await fs.writeFile(SCHEMA_PATH, next);
  console.log(`[prisma-provider] schema provider set to ${raw}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
