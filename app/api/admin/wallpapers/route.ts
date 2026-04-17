import type { NextRequest } from "next/server";
import { requireRole, getClientIp } from "@/server/auth/middleware";
import { ok, fail } from "@/server/shared/response";
import { ERROR_CODES } from "@/server/shared/error-codes";
import { listWallpapers, uploadWallpaper } from "@/server/admin/content/wallpapers/service";
import { writeAudit } from "@/server/admin/audit/writer";

export async function GET(req: NextRequest) {
  try {
    await requireRole(["admin", "superadmin"]);
  } catch (res) {
    return res as Response;
  }
  const url = new URL(req.url);
  const category = url.searchParams.get("category") ?? undefined;
  const page = Number(url.searchParams.get("page") ?? 1);
  const data = await listWallpapers({ category, page });
  return ok(data);
}

export async function POST(req: NextRequest) {
  let actor;
  try {
    actor = await requireRole(["admin", "superadmin"]);
  } catch (res) {
    return res as Response;
  }
  const form = await req.formData().catch(() => null);
  if (!form) return fail(ERROR_CODES.VALIDATION, "invalid multipart body");
  const file = form.get("file");
  const category = (form.get("category") as string) || "default";
  if (!(file instanceof File)) return fail(ERROR_CODES.VALIDATION, "file required");
  if (file.size > 15 * 1024 * 1024) return fail(ERROR_CODES.VALIDATION, "file too large (max 15MB)");
  const buffer = Buffer.from(await file.arrayBuffer());
  const row = await uploadWallpaper({
    filename: file.name,
    buffer,
    contentType: file.type || undefined,
    category,
    uploadedBy: actor.sub
  });
  await writeAudit({
    actorId: actor.sub,
    action: "content.wallpaper.upload",
    targetType: "wallpaper",
    targetId: row.id,
    payload: { category, size: file.size, name: file.name },
    ip: getClientIp(req)
  });
  return ok(row);
}
