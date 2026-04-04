import { createHash } from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import postgres from "postgres";
import {
  getAdminBootstrapConfig,
  getDatabaseUrl
} from "../../src/server/infrastructure/config/app-config";

type InitOnStartOptions = {
  strict?: boolean;
  label?: string;
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

function describeError(error: unknown): string {
  if (error instanceof AggregateError) {
    return error.errors
      .map((item) => (item instanceof Error ? item.message : String(item)))
      .join(" | ");
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
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

export async function initOnStart(options: InitOnStartOptions = {}): Promise<void> {
  const { strict = false, label = "startup" } = options;
  const databaseUrl = getDatabaseUrl();
  const admin = getAdminBootstrapConfig();

  if (!databaseUrl) {
    console.warn("DATABASE_URL is missing, skipping startup database bootstrap.");
    return;
  }

  const sql = postgres(databaseUrl, {
    prepare: false,
    max: 1,
    connect_timeout: 5,
    idle_timeout: 5
  });

  try {
    await ensureSchema(sql);
    const groupId = await ensureDefaultGroup(sql);
    await ensureAdminUser(sql, admin, groupId);
  } catch (error) {
    const message = `[${label}] database bootstrap skipped: ${describeError(error)}`;
    if (strict) {
      throw error;
    }
    console.warn(message);
  } finally {
    await sql.end({ timeout: 5 }).catch(() => undefined);
  }
}
