import path from "node:path";
import { spawn } from "node:child_process";
import { loadRuntimeConfig, getConfiguredPort } from "./runtime/config";
import { resolvePort } from "./runtime/port";
import { initOnStart } from "./runtime/init-on-start";
import { bootstrapGlobalProxy } from "../src/server/infrastructure/proxy/global-proxy";

async function main(): Promise<void> {
  const { config, configPath } = loadRuntimeConfig();
  const preferredPort = getConfiguredPort(config);

  bootstrapGlobalProxy();

  await initOnStart();
  const { port, reason } = await resolvePort(preferredPort);

  if (reason === "occupied") {
    console.warn(`Port ${preferredPort} is in use, switching to ${port}.`);
  } else if (reason === "unconfigured") {
    console.warn(`No PORT configured in ${configPath}, using random port ${port}.`);
  } else if (reason === "fallback") {
    console.warn(`Failed to find a random port, falling back to ${port}.`);
  }

  const nextBin =
    process.platform === "win32"
      ? path.join(process.cwd(), "node_modules", ".bin", "next.cmd")
      : path.join(process.cwd(), "node_modules", ".bin", "next");

  const preloadPath = path.resolve(process.cwd(), "scripts", "runtime", "proxy-preload.cjs");
  const child = spawn(nextBin, ["start", "-p", String(port)], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, `--require ${preloadPath}`].filter(Boolean).join(' ')
    }
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((error: unknown) => {
  console.error("start script failed", error);
  process.exit(1);
});
