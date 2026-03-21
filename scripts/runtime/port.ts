import net from "node:net";

async function isPortAvailable(candidatePort: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => {
      tester.close(() => resolve(true));
    });
    tester.listen(candidatePort);
  });
}

async function getRandomPort(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(0));
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port || 0));
    });
  });
}

export async function resolvePort(
  preferredPort?: number,
  maxAttempts = 10
): Promise<{ port: number; reason: "preferred" | "occupied" | "unconfigured" | "fallback" }> {
  if (Number.isFinite(preferredPort) && (preferredPort as number) > 0) {
    if (await isPortAvailable(preferredPort as number)) {
      return { port: preferredPort as number, reason: "preferred" };
    }
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const randomPort = await getRandomPort();
    if (randomPort && (await isPortAvailable(randomPort))) {
      return { port: randomPort, reason: preferredPort ? "occupied" : "unconfigured" };
    }
  }

  return { port: preferredPort || 3000, reason: "fallback" };
}
