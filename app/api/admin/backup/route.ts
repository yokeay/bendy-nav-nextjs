import type { NextRequest } from "next/server";
import { requireRole, requireReauth, getClientIp } from "@/server/auth/middleware";
import { ok } from "@/server/shared/response";
import { createSnapshot, listSnapshots, isBackupEnabled } from "@/server/admin/settings/backup";
import { writeAudit } from "@/server/admin/audit/writer";

export async function GET() {
  try {
    await requireRole(["admin", "superadmin"]);
  } catch (res) {
    return res as Response;
  }
  const snapshots = await listSnapshots();
  return ok({ enabled: isBackupEnabled(), snapshots });
}

export async function POST(req: NextRequest) {
  let actor;
  try {
    actor = await requireRole(["superadmin"]);
    await requireReauth();
  } catch (res) {
    return res as Response;
  }
  const snapshot = await createSnapshot(actor.sub);
  await writeAudit({
    actorId: actor.sub,
    action: "system.backup.trigger",
    targetType: "backup",
    targetId: snapshot.id,
    payload: { counts: snapshot.counts, sizeBytes: snapshot.sizeBytes },
    ip: getClientIp(req)
  });
  return ok(snapshot);
}
