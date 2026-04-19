import prisma from "@/server/infrastructure/db/prisma";

export type WallpaperColorMode = "day" | "night";

export interface WallpaperEntryInput {
  name: string;
  url: string;
  hdUrl?: string | null;
  description?: string | null;
  colorMode: WallpaperColorMode;
  category?: string;
  sort?: number;
}

export interface ListWallpapersParams {
  colorMode?: WallpaperColorMode;
  category?: string;
  page?: number;
  pageSize?: number;
}

function normalizeColorMode(raw: unknown): WallpaperColorMode {
  return raw === "night" ? "night" : "day";
}

function sanitizeCategory(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9\-_\u4e00-\u9fa5]+/g, "").slice(0, 40) || "default";
}

export async function listWallpapers(params: ListWallpapersParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 40));
  const where: { colorMode?: WallpaperColorMode; category?: string } = {};
  if (params.colorMode) where.colorMode = params.colorMode;
  if (params.category) where.category = params.category;

  const [items, total, categories] = await Promise.all([
    prisma.wallpaper.findMany({
      where,
      orderBy: [{ sort: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.wallpaper.count({ where }),
    prisma.wallpaper.findMany({
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" }
    })
  ]);
  return { items, total, page, pageSize, categories: categories.map((c) => c.category) };
}

export async function createWallpaper(input: WallpaperEntryInput, uploadedBy: string | null) {
  const name = (input.name ?? "").trim().slice(0, 100);
  const url = (input.url ?? "").trim();
  if (!name) throw new Error("name required");
  if (!url) throw new Error("url required");
  return prisma.wallpaper.create({
    data: {
      name,
      url,
      hdUrl: input.hdUrl?.trim() || null,
      description: input.description?.trim() || null,
      colorMode: normalizeColorMode(input.colorMode),
      category: sanitizeCategory(input.category ?? "default"),
      sort: typeof input.sort === "number" ? Math.max(0, Math.floor(input.sort)) : 0,
      uploadedBy
    }
  });
}

export interface BulkImportResult {
  created: number;
  failed: number;
  errors: { index: number; message: string }[];
}

export async function importWallpapersFromJson(
  raw: unknown,
  uploadedBy: string | null
): Promise<BulkImportResult> {
  const list = Array.isArray(raw) ? raw : [];
  const result: BulkImportResult = { created: 0, failed: 0, errors: [] };
  for (let i = 0; i < list.length; i++) {
    const entry = list[i] as Partial<WallpaperEntryInput> | null;
    if (!entry || typeof entry !== "object") {
      result.failed += 1;
      result.errors.push({ index: i, message: "not an object" });
      continue;
    }
    try {
      await createWallpaper(
        {
          name: String(entry.name ?? ""),
          url: String(entry.url ?? ""),
          hdUrl: entry.hdUrl ? String(entry.hdUrl) : null,
          description: entry.description ? String(entry.description) : null,
          colorMode: normalizeColorMode(entry.colorMode),
          category: entry.category ? String(entry.category) : "default",
          sort: typeof entry.sort === "number" ? entry.sort : 0
        },
        uploadedBy
      );
      result.created += 1;
    } catch (err) {
      result.failed += 1;
      result.errors.push({ index: i, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}

export async function updateWallpaper(
  id: string,
  patch: {
    name?: string;
    url?: string;
    hdUrl?: string | null;
    description?: string | null;
    colorMode?: WallpaperColorMode;
    category?: string;
    sort?: number;
  }
) {
  const data: Record<string, unknown> = {};
  if (patch.name !== undefined) data.name = patch.name.trim().slice(0, 100);
  if (patch.url !== undefined) data.url = patch.url.trim();
  if (patch.hdUrl !== undefined) data.hdUrl = patch.hdUrl?.trim() || null;
  if (patch.description !== undefined) data.description = patch.description?.trim() || null;
  if (patch.colorMode !== undefined) data.colorMode = normalizeColorMode(patch.colorMode);
  if (patch.category !== undefined) data.category = sanitizeCategory(patch.category);
  if (patch.sort !== undefined) data.sort = Math.max(0, Math.floor(patch.sort));
  return prisma.wallpaper.update({ where: { id }, data });
}

export async function deleteWallpaper(id: string) {
  const row = await prisma.wallpaper.findUnique({ where: { id } });
  if (!row) return null;
  await prisma.wallpaper.delete({ where: { id } });
  return row;
}
