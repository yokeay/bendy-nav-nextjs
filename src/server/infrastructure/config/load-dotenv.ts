import fs from "node:fs";
import path from "node:path";

const ROOT_MARKERS = ["package.json", ".git"];
const MAX_DEPTH = 6;

let cachedRoot: string | null = null;
let cachedLoadedFiles: string[] | null = null;

function resolveNodeEnv(): string {
  return process.env.NODE_ENV?.trim() || "development";
}

export function resolveProjectRoot(start = process.cwd()): string {
  if (cachedRoot) {
    return cachedRoot;
  }

  let current = start;
  for (let depth = 0; depth < MAX_DEPTH; depth += 1) {
    const hasMarker = ROOT_MARKERS.some((marker) => fs.existsSync(path.join(current, marker)));
    if (hasMarker) {
      cachedRoot = current;
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  cachedRoot = start;
  return start;
}

function parseEnvValue(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return "";
  }

  const quote = trimmed[0];
  if ((quote === `"` || quote === `'`) && trimmed.endsWith(quote)) {
    const inner = trimmed.slice(1, -1);
    if (quote === `"`) {
      return inner
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\r")
        .replace(/\\t/g, "\t")
        .replace(/\\"/g, `"`)
        .replace(/\\\\/g, "\\");
    }
    return inner.replace(/\\'/g, "'");
  }

  return trimmed.replace(/\s+#.*$/, "").trim();
}

function parseEnvFile(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalized = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separatorIndex = normalized.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalized.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }

    const value = normalized.slice(separatorIndex + 1);
    parsed[key] = parseEnvValue(value);
  }

  return parsed;
}

export function loadDotenvFiles(projectRoot = resolveProjectRoot()): string[] {
  if (cachedLoadedFiles) {
    return [...cachedLoadedFiles];
  }

  const nodeEnv = resolveNodeEnv();
  const candidates = [
    `.env.${nodeEnv}.local`,
    nodeEnv === "test" ? null : ".env.local",
    `.env.${nodeEnv}`,
    ".env"
  ].filter((value): value is string => Boolean(value));

  const loadedFiles: string[] = [];

  for (const fileName of candidates) {
    const filePath = path.join(projectRoot, fileName);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const parsed = parseEnvFile(fs.readFileSync(filePath, "utf8"));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }

    loadedFiles.push(filePath);
  }

  cachedLoadedFiles = loadedFiles;
  return [...loadedFiles];
}

export function getLoadedDotenvFiles(projectRoot = resolveProjectRoot()): string[] {
  return loadDotenvFiles(projectRoot);
}
