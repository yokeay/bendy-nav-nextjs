import fs from "node:fs";
import path from "node:path";

export type AppConfig = {
  server: {
    port: number;
  };
  database: {
    url: string;
  };
  smtp: {
    email: string;
    host: string;
    port: number;
    password: string;
    ssl: number;
    codeTemplate: string;
  };
  admin?: {
    email: string;
    password: string;
  };
};

const CONFIG_BASENAME = "app.config.json";
const CONFIG_ENV_PATH = process.env.APP_CONFIG_PATH?.trim();

function resolveConfigPath(): string {
  if (CONFIG_ENV_PATH) {
    return CONFIG_ENV_PATH;
  }

  let current = process.cwd();
  for (let i = 0; i < 4; i += 1) {
    const candidate = path.join(current, CONFIG_BASENAME);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return path.join(process.cwd(), CONFIG_BASENAME);
}

const CONFIG_PATH = resolveConfigPath();
const DEFAULT_DATABASE_URL =
  "postgresql://neondb_owner:npg_LvTB3UknZyC0@ep-old-haze-a1b9r6vf-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

let cachedConfig: AppConfig | null = null;

function normalizeConfig(raw: Partial<AppConfig> | undefined): AppConfig {
  const serverPort = Number(raw?.server?.port ?? 3000) || 3000;
  const databaseUrl = (raw?.database?.url ?? "").trim() || DEFAULT_DATABASE_URL;
  const smtp = (raw?.smtp ?? {}) as Partial<AppConfig["smtp"]>;

  return {
    server: {
      port: serverPort
    },
    database: {
      url: databaseUrl
    },
    smtp: {
      email: String(smtp.email ?? "").trim(),
      host: String(smtp.host ?? "").trim(),
      port: Number(smtp.port ?? 465) || 465,
      password: String(smtp.password ?? ""),
      ssl: Number(smtp.ssl ?? 0) || 0,
      codeTemplate: String(smtp.codeTemplate ?? "")
    },
    admin: {
      email: String(raw?.admin?.email ?? "").trim(),
      password: String(raw?.admin?.password ?? "")
    }
  };
}

export function loadConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  let parsed: unknown;
  try {
    const content = fs.readFileSync(CONFIG_PATH, "utf8");
    const normalized = content.replace(/^\uFEFF/, "");
    parsed = JSON.parse(normalized) as Partial<AppConfig>;
  } catch {
    const fallback = normalizeConfig(undefined);
    cachedConfig = fallback;
    console.warn(`Missing or invalid config file: ${CONFIG_PATH}`);
    return cachedConfig;
  }

  cachedConfig = normalizeConfig(parsed as Partial<AppConfig>);
  return cachedConfig;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}

export function getDatabaseUrl(): string {
  return loadConfig().database.url;
}

export function getServerPort(): number {
  return loadConfig().server.port;
}

export function getSmtpConfig(): AppConfig["smtp"] {
  return loadConfig().smtp;
}

export function getAdminBootstrapConfig(): Required<NonNullable<AppConfig["admin"]>> {
  const admin = loadConfig().admin;
  return {
    email: String(admin?.email ?? "").trim(),
    password: String(admin?.password ?? "")
  };
}
