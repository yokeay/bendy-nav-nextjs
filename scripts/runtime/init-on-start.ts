import { createHash } from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import { loadRuntimeConfig } from "./config";

const DEFAULT_DATABASE_URL =
  "postgresql://neondb_owner:npg_LvTB3UknZyC0@ep-old-haze-a1b9r6vf-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const DEFAULT_ADMIN = {
  email: "admin@polofox.com",
  password: "scx999gd"
};

function md5(value: string): string {
  return createHash("md5").update(value).digest("hex");
}

function nowDateTimeString(): string {
  const now = new Date();
  const pad = (num: number) => String(num).padStart(2, "0");
  return [
    now.getFullYear(),
    "-",
    pad(now.getMonth() + 1),
    "-",
    pad(now.getDate()),
    " ",
    pad(now.getHours()),
    ":",
    pad(now.getMinutes()),
    ":",
    pad(now.getSeconds())
  ].join("");
}

function resolveDatabaseUrl(config: Record<string, unknown>): string {
  const database = (config.database ?? {}) as Record<string, unknown>;
  const url = String(database.url ?? "").trim();
  return url || DEFAULT_DATABASE_URL;
}

function resolveAdminConfig(config: Record<string, unknown>): { email: string; password: string } {
  const admin = (config.admin ?? {}) as Record<string, unknown>;
  const email = String(admin.email ?? "").trim();
  const password = String(admin.password ?? "");
  if (email && password) {
    return { email, password };
  }
  return { ...DEFAULT_ADMIN };
}

async function ensureSchema(sql: postgres.Sql<{}>): Promise<void> {
  const schemaPath = path.join(process.cwd(), "scripts", "sql", "schema.sql");
  const seedPath = path.join(process.cwd(), "scripts", "sql", "seed.sql");
  const schemaSql = await readFile(schemaPath, "utf8");
  const seedSql = await readFile(seedPath, "utf8");

  await sql`ALTER TABLE IF EXISTS "user" ADD COLUMN IF NOT EXISTS wx_open_id VARCHAR(200)`;
  await sql`ALTER TABLE IF EXISTS "user" ADD COLUMN IF NOT EXISTS wx_unionid VARCHAR(200)`;
  await sql.unsafe(schemaSql);
  await sql.unsafe(seedSql);
  await sql`ALTER TABLE user_group ADD COLUMN IF NOT EXISTS default_user_group INTEGER DEFAULT 0`;
}

async function ensureDefaultGroup(sql: postgres.Sql<{}>): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    SELECT id
    FROM user_group
    WHERE default_user_group = 1
    LIMIT 1
  `;
  if (rows.length > 0) {
    return rows[0].id;
  }

  const created = await sql<{ id: number }[]>`
    INSERT INTO user_group(name, create_time, sort, default_user_group)
    VALUES ('default', ${nowDateTimeString()}, 0, 1)
    RETURNING id
  `;
  return created[0]?.id ?? 0;
}

async function ensureAdminUser(
  sql: postgres.Sql<{}>,
  admin: { email: string; password: string },
  groupId: number
): Promise<void> {
  if (!admin.email || !admin.password) {
    console.warn("Admin credentials are missing, skipping admin bootstrap.");
    return;
  }

  const hashed = md5(admin.password);
  const existing = await sql<{ id: number }[]>`
    SELECT id
    FROM "user"
    WHERE mail = ${admin.email}
    LIMIT 1
  `;

  if (existing.length > 0) {
    await sql`
      UPDATE "user"
      SET password = ${hashed},
          manager = 1,
          group_id = ${groupId},
          status = 0
      WHERE id = ${existing[0].id}
    `;
    return;
  }

  await sql`
    INSERT INTO "user"(mail, password, create_time, register_ip, manager, group_id, status)
    VALUES (
      ${admin.email},
      ${hashed},
      ${nowDateTimeString()},
      '',
      1,
      ${groupId},
      0
    )
  `;
}

export async function initOnStart(): Promise<void> {
  const { config } = loadRuntimeConfig();
  const databaseUrl = resolveDatabaseUrl(config);
  const admin = resolveAdminConfig(config);

  const sql = postgres(databaseUrl, { prepare: false, max: 1 });
  try {
    await ensureSchema(sql);
    const groupId = await ensureDefaultGroup(sql);
    await ensureAdminUser(sql, admin, groupId);
  } finally {
    await sql.end({ timeout: 5 });
  }
}
