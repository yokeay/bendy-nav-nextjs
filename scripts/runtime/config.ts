import fs from "node:fs";
import path from "node:path";

const CONFIG_BASENAME = "app.config.json";
const CONFIG_ENV_PATH = process.env.APP_CONFIG_PATH?.trim();

export function resolveConfigPath(cwd = process.cwd()): string {
  if (CONFIG_ENV_PATH) {
    return CONFIG_ENV_PATH;
  }

  let current = cwd;
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

  return path.join(cwd, CONFIG_BASENAME);
}

export function loadRuntimeConfig(cwd = process.cwd()): {
  config: Record<string, unknown>;
  configPath: string;
} {
  const configPath = resolveConfigPath(cwd);
  let config: Record<string, unknown> = {};

  try {
    const content = fs.readFileSync(configPath, "utf8");
    const normalized = content.replace(/^\uFEFF/, "");
    config = (JSON.parse(normalized) ?? {}) as Record<string, unknown>;
  } catch {
    console.warn(`Missing or invalid config file: ${configPath}`);
  }

  return { config, configPath };
}

export function getConfiguredPort(config: Record<string, unknown>): number | undefined {
  const server = (config.server ?? {}) as Record<string, unknown>;
  const port = Number(server.port);
  if (Number.isFinite(port) && port > 0) {
    return port;
  }
  return undefined;
}
