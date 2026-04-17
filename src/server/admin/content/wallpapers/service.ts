import path from "node:path";
import prisma from "@/server/infrastructure/db/prisma";
import { getStorage } from "@/server/infrastructure/storage";

export interface UploadWallpaperInput {
  filename: string;
  buffer: Buffer;
  contentType?: string;
  category?: string;
  uploadedBy?: string | null;
}

export interface ListWallpapersParams {
  category?: string;
  page?: number;
  pageSize?: number;
}

export async function listWallpapers(params: ListWallpapersParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 40));
  const where = params.category ? { category: params.category } : {};
  const [items, total, categories] = await Promise.all([
    prisma.wallpaper.findMany({
      where,
      orderBy: [{ category: "asc" }, { sort: "asc" }, { createdAt: "desc" }],
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

export async function uploadWallpaper(input: UploadWallpaperInput) {
  const ext = path.extname(input.filename) || inferExtension(input.contentType) || ".bin";
  const base = path.basename(input.filename, path.extname(input.filename)).replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 40);
  const category = sanitizeCategory(input.category ?? "default");
  const key = `wallpapers/${category}/${Date.now()}_${base}${ext}`;
  const storage = getStorage();
  const stored = await storage.put(key, input.buffer, { contentType: input.contentType });
  const row = await prisma.wallpaper.create({
    data: {
      url: stored.url,
      category,
      uploadedBy: input.uploadedBy ?? null,
      meta: { key, size: stored.size, contentType: input.contentType ?? null }
    }
  });
  return row;
}

export async function updateWallpaper(id: string, patch: { category?: string; sort?: number }) {
  const data: { category?: string; sort?: number } = {};
  if (patch.category !== undefined) data.category = sanitizeCategory(patch.category);
  if (patch.sort !== undefined) data.sort = Math.max(0, Math.floor(patch.sort));
  return prisma.wallpaper.update({ where: { id }, data });
}

export async function deleteWallpaper(id: string) {
  const row = await prisma.wallpaper.findUnique({ where: { id } });
  if (!row) return null;
  await prisma.wallpaper.delete({ where: { id } });
  const key = (row.meta as { key?: string } | null)?.key;
  if (key) {
    try {
      await getStorage().delete(key);
    } catch (err) {
      console.warn("[wallpaper] storage delete failed", err);
    }
  }
  return row;
}

function sanitizeCategory(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9\-_\u4e00-\u9fa5]+/g, "").slice(0, 40) || "default";
}

function inferExtension(contentType?: string): string | null {
  if (!contentType) return null;
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  if (contentType.includes("avif")) return ".avif";
  return null;
}
