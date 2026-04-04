import path from "node:path";
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { loadRuntimeConfig, getConfiguredPort } from "./runtime/config";
import { resolvePort } from "./runtime/port";
import { initOnStart } from "./runtime/init-on-start";

async function resetNextArtifacts(): Promise<void> {
  try {
    await rm(path.join(process.cwd(), ".next"), {
      recursive: true,
      force: true
    });
  } catch (error) {
    console.warn(
      `[dev] failed to clean .next before startup: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function main(): Promise<void> {
  const { config, configPath } = loadRuntimeConfig();
  const preferredPort = getConfiguredPort(config);

  await resetNextArtifacts();
  await initOnStart({ strict: false, label: "dev" });
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

  const child = spawn(nextBin, ["dev", "-p", String(port)], {
    stdio: "inherit",
    shell: process.platform === "win32"
  });

  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((error: unknown) => {
  console.error("dev script failed", error);
  process.exit(1);
});
