import { type NextRequest } from "next/server";
import prisma from "@/server/infrastructure/db/prisma";
import { readSession } from "@/server/auth/middleware";
import { ok, fail } from "@/server/shared/response";
import { ERROR_CODES } from "@/server/shared/error-codes";

// POST /api/launchpad/assign — assign or unassign items to/from a category
export async function POST(req: NextRequest) {
  const session = await readSession();
  if (!session) return fail(ERROR_CODES.UNAUTHORIZED, "unauthorized", 401);

  const body = (await req.json()) as { categoryId: string | null; linkIds?: string[]; bookmarkIds?: string[] };
  const { categoryId, linkIds = [], bookmarkIds = [] } = body;

  if (!linkIds.length && !bookmarkIds.length) {
    return fail(ERROR_CODES.VALIDATION, "linkIds or bookmarkIds is required", 400);
  }

  if (categoryId !== null) {
    const category = await prisma.category.findFirst({
      where: { id: categoryId, userId: session.sub }
    });
    if (!category) return fail(ERROR_CODES.NOT_FOUND, "category not found", 404);
  }

  await Promise.all([
    linkIds.length ? prisma.link.updateMany({
      where: { id: { in: linkIds }, userId: session.sub },
      data: { categoryId: categoryId ?? null }
    }) : Promise.resolve(),
    bookmarkIds.length ? prisma.bookmark.updateMany({
      where: { id: { in: bookmarkIds }, userId: session.sub },
      data: { categoryId: categoryId ?? null }
    }) : Promise.resolve()
  ]);

  return ok({ assigned: true, categoryId, linkIds, bookmarkIds });
}
