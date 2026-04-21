import type { NextRequest } from "next/server";
import { ok, fail } from "@/server/shared/response";
import { ERROR_CODES, type ErrorCode } from "@/server/shared/error-codes";
import { requireAuth, getClientIp } from "@/server/auth/middleware";
import { writeAudit } from "@/server/admin/audit/writer";
import {
  getSubmission,
  updateSubmission,
  type AuthorContext
} from "@/server/cards/submission-service";
import type { CardSubmissionInput } from "@/server/cards/types";

interface Context {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, context: Context) {
  let session;
  try {
    session = await requireAuth();
  } catch (res) {
    return res as Response;
  }

  const { id } = await context.params;
  const submission = await getSubmission(id);
  if (!submission) {
    return fail(ERROR_CODES.NOT_FOUND, "提交不存在", 404);
  }
  const isAdmin = session.role === "admin" || session.role === "superadmin";
  if (submission.authorId !== session.sub && !isAdmin) {
    return fail(ERROR_CODES.FORBIDDEN, "无权查看该提交", 403);
  }
  return ok({ submission });
}

export async function PATCH(req: NextRequest, context: Context) {
  let session;
  try {
    session = await requireAuth();
  } catch (res) {
    return res as Response;
  }

  const { id } = await context.params;
  const body = (await req.json().catch(() => ({}))) as CardSubmissionInput;
  const author: AuthorContext = {
    authorId: session.sub,
    role: session.role
  };

  const res = await updateSubmission(author, id, body);
  if (res.ok !== true) {
    let code: ErrorCode = ERROR_CODES.VALIDATION;
    let status = 400;
    if (res.notFound) {
      code = ERROR_CODES.NOT_FOUND;
      status = 404;
    } else if (res.forbidden) {
      code = ERROR_CODES.FORBIDDEN;
      status = 403;
    } else if (res.conflict) {
      code = ERROR_CODES.CONFLICT;
    }
    return fail(code, `[${res.field}] ${res.reason}`, status);
  }

  await writeAudit({
    actorId: session.sub,
    action: res.result.autoApproved ? "card.auto_approve" : "card.update",
    targetType: "card_submission",
    targetId: res.result.submission.id,
    payload: {
      slug: res.result.submission.slug,
      status: res.result.submission.status,
      version: res.result.submission.version,
      cardId: res.result.card?.id ?? null
    },
    ip: getClientIp(req)
  });

  return ok(res.result);
}
