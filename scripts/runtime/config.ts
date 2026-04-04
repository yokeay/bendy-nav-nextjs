import {
  type AppConfig,
  getConfigPath,
  loadConfig
} from "../../src/server/infrastructure/config/app-config";

export function loadRuntimeConfig(cwd = process.cwd()): {
  config: AppConfig;
  configPath: string;
} {
  void cwd;
  return {
    config: loadConfig(),
    configPath: getConfigPath()
  };
}

export function getConfiguredPort(config: Pick<AppConfig, "server">): number | undefined {
  const port = Number(config.server.port);
  if (Number.isFinite(port) && port > 0) {
    return port;
  }
  return undefined;
}
