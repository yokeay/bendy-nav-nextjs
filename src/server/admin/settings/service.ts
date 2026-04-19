import prisma from "@/server/infrastructure/db/prisma";
import type { Prisma } from "@prisma/client";

export const SYSTEM_CONFIG_KEYS = {
  SITE: "site",
  BACKUP: "backup"
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
