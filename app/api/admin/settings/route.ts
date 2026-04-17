import type { NextRequest } from "next/server";
import { requireRole, requireReauth, getClientIp } from "@/server/auth/middleware";
import { ok, fail } from "@/server/shared/response";
import { ERROR_CODES } from "@/server/shared/error-codes";
import { getSiteConfig, updateSiteConfig, type SiteConfig } from "@/server/admin/settings/service";
import { writeAudit } from "@/server/admin/audit/writer";

export async function GET() {
  try {
    await requireRole(["admin", "superadmin"]);
  } catch (res) {
    return res as Response;
  }
  const site = await getSiteConfig();
  return ok({ site });
}

export async function PATCH(req: NextRequest) {
  let actor;
  try {
    actor = await requireRole(["admin", "superadmin"]);
    await requireReauth();
  } catch (res) {
    return res as Response;
  }

  const body = (await req.json().catch(() => null)) as Partial<SiteConfig> | null;
  if (!body || typeof body !== "object") {
    return fail(ERROR_CODES.VALIDATION, "body required");
  }

  const allowed: Partial<SiteConfig> = {};
  if (typeof body.title === "string") allowed.title = body.title.slice(0, 120);
  if (body.description === null || typeof body.description === "string") allowed.description = body.description;
  if (body.icp === null || typeof body.icp === "string") allowed.icp = body.icp;
  if (body.logo === null || typeof body.logo === "string") allowed.logo = body.logo;
  if (typeof body.maintenance === "boolean") allowed.maintenance = body.maintenance;

  const next = await updateSiteConfig(allowed, actor.sub);
  await writeAudit({
    actorId: actor.sub,
    action: "maintenance" in allowed ? "system.maintenance.toggle" : "system.config.update",
    targetType: "system",
    targetId: "site",
    payload: allowed,
    ip: getClientIp(req)
  });
  return ok({ site: next });
}
