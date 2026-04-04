import fs from "node:fs";
import path from "node:path";
import {
  getLoadedDotenvFiles,
  loadDotenvFiles,
  resolveProjectRoot
} from "./load-dotenv";

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

export type AppConfigSource = {
  envFiles: string[];
  legacyConfigPath: string | null;
  primarySource: string;
  projectRoot: string;
};

const LEGACY_CONFIG_BASENAME = "app.config.json";
const LEGACY_CONFIG_ENV_PATH = process.env.APP_CONFIG_PATH?.trim();
const DEFAULT_SERVER_PORT = 3000;

let cachedConfig: AppConfig | null = null;
let cachedSource: AppConfigSource | null = null;

function resolveLegacyConfigPath(projectRoot: string): string | null {
  if (LEGACY_CONFIG_ENV_PATH) {
    return LEGACY_CONFIG_ENV_PATH;
  }

  let current = projectRoot;
  for (let i = 0; i < 4; i += 1) {
    const candidate = path.join(current, LEGACY_CONFIG_BASENAME);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}

function readStringEnv(names: string[], fallback = "", trim = true): string {
  for (const name of names) {
    const rawValue = process.env[name];
    if (rawValue === undefined) {
      continue;
    }

    const value = trim ? rawValue.trim() : rawValue;
    if (trim ? value !== "" : rawValue !== "") {
      return value;
    }
  }

  return fallback;
}

function readNumberEnv(names: string[], fallback: number): number {
  for (const name of names) {
    const rawValue = process.env[name];
    if (rawValue === undefined || rawValue.trim() === "") {
      continue;
    }

    const value = Number(rawValue);
    if (Number.isFinite(value) && value > 0) {
      return value;
    }
  }

  return fallback;
}

function readFlagEnv(names: string[], fallback: number): number {
  for (const name of names) {
    const rawValue = process.env[name];
    if (rawValue === undefined || rawValue.trim() === "") {
      continue;
    }

    const normalized = rawValue.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return 1;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
      return 0;
    }
  }

  return fallback;
}

function loadLegacyConfig(projectRoot: string): {
  configPath: string | null;
  rawConfig: Partial<AppConfig> | undefined;
} {
  const configPath = resolveLegacyConfigPath(projectRoot);
  if (!configPath) {
    return {
      configPath: null,
      rawConfig: undefined
    };
  }

  try {
    const content = fs.readFileSync(configPath, "utf8");
    const normalized = content.replace(/^\uFEFF/, "");
    return {
      configPath,
      rawConfig: JSON.parse(normalized) as Partial<AppConfig>
    };
  } catch {
    console.warn(`Invalid legacy config file: ${configPath}`);
    return {
      configPath,
      rawConfig: undefined
    };
  }
}

function normalizeConfig(raw: Partial<AppConfig> | undefined): AppConfig {
  const serverPort = readNumberEnv(
    ["PORT", "SERVER_PORT"],
    Number(raw?.server?.port ?? DEFAULT_SERVER_PORT) || DEFAULT_SERVER_PORT
  );
  const databaseUrl = readStringEnv(["DATABASE_URL"], String(raw?.database?.url ?? "").trim());
  const smtp = (raw?.smtp ?? {}) as Partial<AppConfig["smtp"]>;

  return {
    server: {
      port: serverPort
    },
    database: {
      url: databaseUrl
    },
    smtp: {
      email: readStringEnv(["SMTP_EMAIL"], String(smtp.email ?? "").trim()),
      host: readStringEnv(["SMTP_HOST"], String(smtp.host ?? "").trim()),
      port: readNumberEnv(["SMTP_PORT"], Number(smtp.port ?? 465) || 465),
      password: readStringEnv(["SMTP_PASSWORD"], String(smtp.password ?? ""), false),
      ssl: readFlagEnv(["SMTP_SSL", "SMTP_SECURE"], Number(smtp.ssl ?? 0) || 0),
      codeTemplate: readStringEnv(["SMTP_CODE_TEMPLATE"], String(smtp.codeTemplate ?? ""), false)
    },
    admin: {
      email: readStringEnv(["ADMIN_EMAIL"], String(raw?.admin?.email ?? "").trim()),
      password: readStringEnv(["ADMIN_PASSWORD"], String(raw?.admin?.password ?? ""), false)
    }
  };
}

export function loadConfig(): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const projectRoot = resolveProjectRoot();
  const envFiles = loadDotenvFiles(projectRoot);
  const { configPath, rawConfig } = loadLegacyConfig(projectRoot);

  cachedSource = {
    envFiles,
    legacyConfigPath: configPath,
    primarySource: envFiles[0] ?? configPath ?? path.join(projectRoot, ".env"),
    projectRoot
  };

  if (envFiles.length === 0 && !configPath) {
    console.warn(
      `No configuration file found. Copy ${path.join(projectRoot, ".env.example")} to ${path.join(projectRoot, ".env")}.`
    );
  } else if (envFiles.length === 0 && configPath) {
    console.warn(`Using deprecated legacy config file: ${configPath}. Prefer .env files instead.`);
  }

  cachedConfig = normalizeConfig(rawConfig);
  return cachedConfig;
}

export function getConfigPath(): string {
  return getConfigSource().primarySource;
}

export function getConfigSource(): AppConfigSource {
  loadConfig();
  return {
    envFiles: [...(cachedSource?.envFiles ?? getLoadedDotenvFiles())],
    legacyConfigPath: cachedSource?.legacyConfigPath ?? null,
    primarySource: cachedSource?.primarySource ?? path.join(resolveProjectRoot(), ".env"),
    projectRoot: cachedSource?.projectRoot ?? resolveProjectRoot()
  };
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
