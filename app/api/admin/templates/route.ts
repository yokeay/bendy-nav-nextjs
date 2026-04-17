import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { requireRole, requireReauth, getClientIp } from "@/server/auth/middleware";
import { ok, fail } from "@/server/shared/response";
import { ERROR_CODES } from "@/server/shared/error-codes";
import { listTemplates, publishTemplate } from "@/server/admin/content/templates/service";
import { writeAudit } from "@/server/admin/audit/writer";

export async function GET() {
  try {
    await requireRole(["admin", "superadmin"]);
  } catch (res) {
    return res as Response;
  }
  const items = await listTemplates();
  return ok(items);
}

export async function POST(req: NextRequest) {
  let actor;
  try {
    actor = await requireRole(["admin", "superadmin"]);
    await requireReauth();
  } catch (res) {
    return res as Response;
  }

  const body = (await req.json().catch(() => ({}))) as {
    version?: string;
    content?: unknown;
    notes?: string;
  };
  if (!body.version || typeof body.version !== "string") {
    return fail(ERROR_CODES.VALIDATION, "version required");
  }
  if (!body.content || typeof body.content !== "object") {
    return fail(ERROR_CODES.VALIDATION, "content (JSON object) required");
  }
  const row = await publishTemplate({
    version: body.version.trim(),
    content: body.content as Prisma.InputJsonValue,
    notes: body.notes,
    publishedBy: actor.sub
  });
  await writeAudit({
    actorId: actor.sub,
    action: "content.template.publish",
    targetType: "template",
    targetId: row.id,
    payload: { version: row.version },
    ip: getClientIp(req)
  });
  return ok(row);
}
