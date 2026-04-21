import type { NextRequest } from "next/server";
import { ok, fail } from "@/server/shared/response";
import { createSnapshot } from "@/server/admin/settings/backup";
import { writeAudit } from "@/server/admin/audit/writer";

const CRON_SECRET = process.env.CRON_SECRET ?? "";

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!CRON_SECRET || token !== CRON_SECRET) {
    return fail(1001, "unauthorized", 401);
  }

  try {
    const snapshot = await createSnapshot(null);
    await writeAudit({
      actorId: null,
      action: "system.backup.cron",
      targetType: "backup",
      targetId: snapshot.id,
      payload: { counts: snapshot.counts, sizeBytes: snapshot.sizeBytes, source: "cron-daily-18" }
    });
    return ok(snapshot);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(5001, message, 500);
  }
}
