import type { NextRequest } from "next/server";
import { ok, fail } from "@/server/shared/response";
import { ERROR_CODES } from "@/server/shared/error-codes";
import { requireAuth, getClientIp } from "@/server/auth/middleware";
import { writeAudit } from "@/server/admin/audit/writer";
import {
  createSubmission,
  listSubmissions,
  type AuthorContext
} from "@/server/cards/submission-service";
import type { CardSubmissionInput } from "@/server/cards/types";

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireAuth();
  } catch (res) {
    return res as Response;
  }

  const body = (await req.json().catch(() => ({}))) as CardSubmissionInput;
  const author: AuthorContext = {
    authorId: session.sub,
    role: session.role
  };

  const res = await createSubmission(author, body);
  if (res.ok !== true) {
    const code = res.conflict ? ERROR_CODES.CONFLICT : ERROR_CODES.VALIDATION;
    return fail(code, `[${res.field}] ${res.reason}`);
  }

  const ip = getClientIp(req);
  await writeAudit({
    actorId: session.sub,
    action: res.result.autoApproved ? "card.auto_approve" : "card.submit",
    targetType: "card_submission",
    targetId: res.result.submission.id,
    payload: {
      slug: res.result.submission.slug,
      host: res.result.submission.host,
      version: res.result.submission.version,
      status: res.result.submission.status,
      cardId: res.result.card?.id ?? null
    },
    ip
  });

  return ok(res.result);
}

export async function GET(req: NextRequest) {
  let session;
  try {
    session = await requireAuth();
  } catch (res) {
    return res as Response;
  }

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const status = url.searchParams.get("status") ?? undefined;

  const result = await listSubmissions({
    authorId: session.sub,
    status,
    page
  });
  return ok(result);
}
