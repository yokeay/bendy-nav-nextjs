import type { NextRequest } from "next/server";
import { ok, fail } from "@/server/shared/response";
import { ERROR_CODES } from "@/server/shared/error-codes";
import { requireRole, getClientIp } from "@/server/auth/middleware";
import { writeAudit, type AuditAction } from "@/server/admin/audit/writer";
import { reviewSubmission } from "@/server/cards/submission-service";
import { isCardReviewAction, type CardReviewAction } from "@/server/cards/types";

interface Context {
  params: Promise<{ id: string }>;
}

const ACTION_TO_AUDIT: Record<CardReviewAction, AuditAction> = {
  approve: "card.approve",
  reject: "card.reject",
  request_changes: "card.request_changes",
  deprecate: "card.deprecate"
};

export async function PATCH(req: NextRequest, context: Context) {
  let session;
  try {
    session = await requireRole(["admin", "superadmin"]);
  } catch (res) {
    return res as Response;
  }

  const { id } = await context.params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: unknown;
    note?: unknown;
    rejectReason?: unknown;
    version?: unknown;
  };

  if (!isCardReviewAction(body.action)) {
    return fail(ERROR_CODES.VALIDATION, "action 必须是 approve/reject/request_changes/deprecate");
  }

  const res = await reviewSubmission(session.sub, id, {
    action: body.action,
    note: typeof body.note === "string" ? body.note : null,
    rejectReason: typeof body.rejectReason === "string" ? body.rejectReason : null,
    version: typeof body.version === "string" ? body.version : null
  });

  if (res.ok !== true) {
    const code = res.notFound ? ERROR_CODES.NOT_FOUND : ERROR_CODES.VALIDATION;
    return fail(code, `[${res.field}] ${res.reason}`, res.notFound ? 404 : 400);
  }

  await writeAudit({
    actorId: session.sub,
    action: ACTION_TO_AUDIT[body.action],
    targetType: "card_submission",
    targetId: id,
    payload: {
      slug: res.result.submission.slug,
      status: res.result.submission.status,
      cardId: res.result.card?.id ?? null,
      version: res.result.card?.version ?? res.result.submission.version
    },
    ip: getClientIp(req)
  });

  return ok(res.result);
}
