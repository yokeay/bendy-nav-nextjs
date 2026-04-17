import type { NextRequest } from "next/server";
import { requireRole, requireReauth, getClientIp } from "@/server/auth/middleware";
import { ok } from "@/server/shared/response";
import { revokeAllSessions } from "@/server/admin/users/service";
import { writeAudit } from "@/server/admin/audit/writer";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let actor;
  try {
    actor = await requireRole(["admin", "superadmin"]);
    await requireReauth();
  } catch (res) {
    return res as Response;
  }
  const { id } = await ctx.params;
  const revoked = await revokeAllSessions(id);
  await writeAudit({
    actorId: actor.sub,
    action: "user.session.revoke",
    targetType: "user",
    targetId: id,
    payload: { revoked },
    ip: getClientIp(req)
  });
  return ok({ revoked });
}
