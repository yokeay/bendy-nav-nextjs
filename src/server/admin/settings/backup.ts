import prisma from "@/server/infrastructure/db/prisma";
import { getStorage } from "@/server/infrastructure/storage";
import { getConfig, setConfig, SYSTEM_CONFIG_KEYS } from "@/server/admin/settings/service";

export interface BackupSnapshot {
  id: string;
  key: string;
  url: string;
  createdAt: string;
  createdBy: string | null;
  sizeBytes: number;
  counts: Record<string, number>;
}

interface BackupIndex {
  snapshots: BackupSnapshot[];
}

const INDEX_KEY = "backup.index";

async function readIndex(): Promise<BackupIndex> {
  return getConfig<BackupIndex>(INDEX_KEY, { snapshots: [] });
}

async function writeIndex(index: BackupIndex, updatedBy?: string | null): Promise<void> {
  await setConfig(INDEX_KEY, index as unknown as import("@prisma/client").Prisma.InputJsonValue, updatedBy);
}

export async function listSnapshots(): Promise<BackupSnapshot[]> {
  const index = await readIndex();
  return [...index.snapshots].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createSnapshot(createdBy?: string | null): Promise<BackupSnapshot> {
  const [users, pages, links, folders, docks, settings, wallpapers, templates, systemConfigs, engines, userEngines] =
    await Promise.all([
      prisma.user.findMany(),
      prisma.page.findMany(),
      prisma.link.findMany(),
      prisma.linkFolder.findMany(),
      prisma.dock.findMany(),
      prisma.setting.findMany(),
      prisma.wallpaper.findMany(),
      prisma.defaultTemplate.findMany(),
      prisma.systemConfig.findMany({ where: { key: { not: INDEX_KEY } } }),
      prisma.searchEngine.findMany(),
      prisma.userSearchEngine.findMany()
    ]);

  const payload = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    counts: {
      users: users.length,
      pages: pages.length,
      links: links.length,
      folders: folders.length,
      docks: docks.length,
      settings: settings.length,
      wallpapers: wallpapers.length,
      templates: templates.length,
      systemConfigs: systemConfigs.length,
      searchEngines: engines.length,
      userSearchEngines: userEngines.length
    },
    data: {
      users,
      pages,
      links,
      folders,
      docks,
      settings,
      wallpapers,
      templates,
      systemConfigs,
      searchEngines: engines,
      userSearchEngines: userEngines
    }
  };

  const body = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
  const stamp = payload.createdAt.replace(/[:.]/g, "-");
  const key = `backups/bendy_${stamp}.json`;
  const result = await getStorage().put(key, body, { contentType: "application/json" });

  const snapshot: BackupSnapshot = {
    id: stamp,
    key: result.key,
    url: result.url,
    createdAt: payload.createdAt,
    createdBy: createdBy ?? null,
    sizeBytes: result.size,
    counts: payload.counts
  };

  const index = await readIndex();
  index.snapshots.push(snapshot);
  // keep the most recent 20 only
  index.snapshots = [...index.snapshots]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 20);
  await writeIndex(index, createdBy);

  return snapshot;
}

export function isBackupEnabled(): boolean {
  return String(process.env.BACKUP_ENABLED ?? "false").toLowerCase() === "true";
}

// prevent unused import warning
void SYSTEM_CONFIG_KEYS;
