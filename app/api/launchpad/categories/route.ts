import { type NextRequest } from "next/server";
import prisma from "@/server/infrastructure/db/prisma";
import { readSession } from "@/server/auth/middleware";
import { ok, fail } from "@/server/shared/response";
import { ERROR_CODES } from "@/server/shared/error-codes";

export async function GET(_req: NextRequest) {
  const session = await readSession();
  if (!session) return fail(ERROR_CODES.UNAUTHORIZED, "unauthorized", 401);

  const categories = await prisma.category.findMany({
    where: { userId: session.sub },
    select: { id: true, name: true, icon: true, color: true, sort: true, _count: { select: { links: true, bookmarks: true } } },
    orderBy: [{ sort: "asc" }, { createdAt: "asc" }]
  });

  return ok(categories.map(c => ({ ...c, linkCount: c._count.links, bookmarkCount: c._count.bookmarks })));
}

export async function POST(req: NextRequest) {
  const session = await readSession();
  if (!session) return fail(ERROR_CODES.UNAUTHORIZED, "unauthorized", 401);

  const body = (await req.json()) as { name?: string; icon?: string; color?: string };
  const name = body?.name?.trim();
  if (!name) return fail(ERROR_CODES.VALIDATION, "name is required", 400);

  const category = await prisma.category.create({
    data: { userId: session.sub, name, icon: body.icon ?? null, color: body.color ?? null }
  });

  return ok(category, { status: 201 });
}
