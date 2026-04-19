import type { NextRequest } from "next/server";
import { requireRole, getClientIp } from "@/server/auth/middleware";
import { ok, fail } from "@/server/shared/response";
import { ERROR_CODES } from "@/server/shared/error-codes";
import { updateWallpaper, deleteWallpaper } from "@/server/admin/content/wallpapers/service";
import { writeAudit } from "@/server/admin/audit/writer";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let actor;
  try {
    actor = await requireRole(["admin", "superadmin"]);
  } catch (res) {
    return res as Response;
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    url?: string;
    hdUrl?: string | null;
    description?: string | null;
    colorMode?: "day" | "night";
    category?: string;
    sort?: number;
  };
  const row = await updateWallpaper(id, body);
  await writeAudit({
    actorId: actor.sub,
    action: "content.wallpaper.update",
    targetType: "wallpaper",
    targetId: id,
    payload: body,
    ip: getClientIp(req)
  });
  return ok(row);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let actor;
  try {
    actor = await requireRole(["admin", "superadmin"]);
  } catch (res) {
    return res as Response;
  }
  const { id } = await ctx.params;
  const row = await deleteWallpaper(id);
  if (!row) return fail(ERROR_CODES.NOT_FOUND, "not found", 404);
  await writeAudit({
    actorId: actor.sub,
    action: "content.wallpaper.delete",
    targetType: "wallpaper",
    targetId: id,
    ip: getClientIp(req)
  });
  return ok({ id });
}
