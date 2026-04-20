import type { NextRequest } from "next/server";
import { requireRole, getClientIp } from "@/server/auth/middleware";
import { ok, fail } from "@/server/shared/response";
import { ERROR_CODES } from "@/server/shared/error-codes";
import { updateRecommendation } from "@/server/admin/content/recommendations/service";
import { writeAudit } from "@/server/admin/audit/writer";
import prisma from "@/server/infrastructure/db/prisma";

interface Params {
  id: string;
}

interface Context {
  params: Promise<Params>;
}

export async function PATCH(req: NextRequest, context: Context) {
  let session;
  try {
    session = await requireRole(["admin", "superadmin"]);
  } catch (res) {
    return res as Response;
  }

  const { id } = await context.params;
  if (!id) {
    return fail(ERROR_CODES.VALIDATION, "bookmark id is required");
  }

  const existing = await prisma.bookmark.findUnique({ where: { id } });
  if (!existing) {
    return fail(ERROR_CODES.NOT_FOUND, "bookmark not found", 404);
  }

  const body = (await req.json().catch(() => ({}))) as {
    isRecommended?: unknown;
    recommendTitle?: unknown;
    recommendDesc?: unknown;
    recommendSort?: unknown;
    isPublic?: unknown;
  };

  try {
    const updated = await updateRecommendation({
      bookmarkId: id,
      actorId: session.sub,
      isRecommended: typeof body.isRecommended === "boolean" ? body.isRecommended : undefined,
      recommendTitle: typeof body.recommendTitle === "string" || body.recommendTitle === null
        ? (body.recommendTitle as string | null)
        : undefined,
      recommendDesc: typeof body.recommendDesc === "string" || body.recommendDesc === null
        ? (body.recommendDesc as string | null)
        : undefined,
      recommendSort: typeof body.recommendSort === "number" ? body.recommendSort : undefined,
      isPublic: typeof body.isPublic === "boolean" ? body.isPublic : undefined
    });

    await writeAudit({
      actorId: session.sub,
      action: "recommendation.update",
      targetType: "bookmark",
      targetId: id,
      payload: {
        isRecommended: updated.isRecommended,
        recommendSort: updated.recommendSort,
        isPublic: updated.isPublic
      },
      ip: getClientIp(req)
    });

    return ok({
      id: updated.id,
      isRecommended: updated.isRecommended,
      recommendTitle: updated.recommendTitle,
      recommendDesc: updated.recommendDesc,
      recommendSort: updated.recommendSort,
      isPublic: updated.isPublic
    });
  } catch (err) {
    return fail(ERROR_CODES.INTERNAL, (err as Error).message, 500);
  }
}
