import type { NextRequest } from "next/server";
import { requireRole, getClientIp } from "@/server/auth/middleware";
import { ok, fail } from "@/server/shared/response";
import { ERROR_CODES } from "@/server/shared/error-codes";
import {
  createWallpaper,
  importWallpapersFromJson,
  listWallpapers
} from "@/server/admin/content/wallpapers/service";
import { writeAudit } from "@/server/admin/audit/writer";

export async function GET(req: NextRequest) {
  try {
    await requireRole(["admin", "superadmin"]);
  } catch (res) {
    return res as Response;
  }
  const url = new URL(req.url);
  const colorModeParam = url.searchParams.get("colorMode");
  const colorMode =
    colorModeParam === "day" || colorModeParam === "night" ? colorModeParam : undefined;
  const category = url.searchParams.get("category") ?? undefined;
  const page = Number(url.searchParams.get("page") ?? 1);
  const data = await listWallpapers({ colorMode, category, page });
  return ok(data);
}

export async function POST(req: NextRequest) {
  let actor;
  try {
    actor = await requireRole(["admin", "superadmin"]);
  } catch (res) {
    return res as Response;
  }
  const body = (await req.json().catch(() => null)) as
    | { mode?: "single" | "json"; entry?: unknown; entries?: unknown }
    | null;
  if (!body) return fail(ERROR_CODES.VALIDATION, "invalid json body");

  if (body.mode === "json") {
    const result = await importWallpapersFromJson(body.entries, actor.sub);
    await writeAudit({
      actorId: actor.sub,
      action: "content.wallpaper.import",
      targetType: "wallpaper",
      targetId: null,
      payload: { created: result.created, failed: result.failed },
      ip: getClientIp(req)
    });
    return ok(result);
  }

  const entry = (body.entry ?? body) as Record<string, unknown>;
  try {
    const row = await createWallpaper(
      {
        name: String(entry.name ?? ""),
        url: String(entry.url ?? ""),
        hdUrl: entry.hdUrl ? String(entry.hdUrl) : null,
        description: entry.description ? String(entry.description) : null,
        colorMode: entry.colorMode === "night" ? "night" : "day",
        category: entry.category ? String(entry.category) : "default"
      },
      actor.sub
    );
    await writeAudit({
      actorId: actor.sub,
      action: "content.wallpaper.create",
      targetType: "wallpaper",
      targetId: row.id,
      payload: { name: row.name, colorMode: row.colorMode },
      ip: getClientIp(req)
    });
    return ok(row);
  } catch (err) {
    return fail(ERROR_CODES.VALIDATION, err instanceof Error ? err.message : "create failed");
  }
}
