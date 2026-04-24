import { randomBytes } from "node:crypto";
import prisma from "@/server/infrastructure/db/prisma";
import type { Prisma } from "@prisma/client";

export const SYSTEM_CONFIG_KEYS = {
  SITE: "site",
  BACKUP: "backup",
  BOOKMARK_IMPORT: "bookmarkImport"
} as const;

export interface SiteConfig {
  title: string;
  description: string | null;
  icp: string | null;
  logo: string | null;
  maintenance: boolean;
}

const DEFAULT_SITE: SiteConfig = {
  title: "笨迪导航",
  description: null,
  icp: null,
  logo: null,
  maintenance: false
};

export async function getSiteConfig(): Promise<SiteConfig> {
  const row = await prisma.systemConfig.findUnique({ where: { key: SYSTEM_CONFIG_KEYS.SITE } });
  if (!row) return DEFAULT_SITE;
  return { ...DEFAULT_SITE, ...(row.value as Partial<SiteConfig>) };
}

export async function updateSiteConfig(patch: Partial<SiteConfig>, updatedBy?: string | null): Promise<SiteConfig> {
  const current = await getSiteConfig();
  const next: SiteConfig = { ...current, ...patch };
  await prisma.systemConfig.upsert({
    where: { key: SYSTEM_CONFIG_KEYS.SITE },
    update: { value: next as unknown as Prisma.InputJsonValue, updatedBy: updatedBy ?? null },
    create: { key: SYSTEM_CONFIG_KEYS.SITE, value: next as unknown as Prisma.InputJsonValue, updatedBy: updatedBy ?? null }
  });
  return next;
}

export async function getConfig<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.systemConfig.findUnique({ where: { key } });
  if (!row) return fallback;
  return row.value as T;
}

export async function setConfig<T extends Prisma.InputJsonValue>(key: string, value: T, updatedBy?: string | null): Promise<void> {
  await prisma.systemConfig.upsert({
    where: { key },
    update: { value, updatedBy: updatedBy ?? null },
    create: { key, value, updatedBy: updatedBy ?? null }
  });
}

// ---------- Bookmark Import ----------
// Controls POST /api/bookmarks/import. DB is the source of truth; the env var
// BOOKMARK_IMPORT_API_KEY remains a fallback so existing deployments keep working.

export interface BookmarkImportConfig {
  enabled: boolean;
  apiKey: string | null;
  updatedAt: string;
}

const DEFAULT_BOOKMARK_IMPORT: BookmarkImportConfig = {
  enabled: false,
  apiKey: null,
  updatedAt: ""
};

export async function getBookmarkImportConfig(): Promise<BookmarkImportConfig> {
  const row = await prisma.systemConfig.findUnique({ where: { key: SYSTEM_CONFIG_KEYS.BOOKMARK_IMPORT } });
  if (!row) return { ...DEFAULT_BOOKMARK_IMPORT };
  const value = row.value as Partial<BookmarkImportConfig> | null;
  return {
    enabled: value?.enabled === true,
    apiKey: typeof value?.apiKey === "string" && value.apiKey.length > 0 ? value.apiKey : null,
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : row.updatedAt.toISOString()
  };
}

export async function updateBookmarkImportConfig(
  patch: Partial<Pick<BookmarkImportConfig, "enabled" | "apiKey">>,
  updatedBy?: string | null
): Promise<BookmarkImportConfig> {
  const current = await getBookmarkImportConfig();
  const next: BookmarkImportConfig = {
    enabled: patch.enabled ?? current.enabled,
    apiKey: patch.apiKey === undefined ? current.apiKey : patch.apiKey,
    updatedAt: new Date().toISOString()
  };
  await prisma.systemConfig.upsert({
    where: { key: SYSTEM_CONFIG_KEYS.BOOKMARK_IMPORT },
    update: { value: next as unknown as Prisma.InputJsonValue, updatedBy: updatedBy ?? null },
    create: { key: SYSTEM_CONFIG_KEYS.BOOKMARK_IMPORT, value: next as unknown as Prisma.InputJsonValue, updatedBy: updatedBy ?? null }
  });
  return next;
}

export function generateBookmarkImportApiKey(): string {
  return randomBytes(24).toString("hex");
}

export function resolveBookmarkImportEffectiveKey(cfg: BookmarkImportConfig): {
  key: string | null;
  source: "db" | "env" | "none";
} {
  if (cfg.apiKey) return { key: cfg.apiKey, source: "db" };
  const envKey = process.env.BOOKMARK_IMPORT_API_KEY;
  if (envKey && envKey.trim()) return { key: envKey.trim(), source: "env" };
  return { key: null, source: "none" };
}

export function maskBookmarkImportApiKey(key: string | null): string {
  if (!key) return "";
  if (key.length < 8) return "…";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}
