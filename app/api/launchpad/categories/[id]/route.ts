import { type NextRequest } from "next/server";
import prisma from "@/server/infrastructure/db/prisma";
import { readSession } from "@/server/auth/middleware";
import { ok, fail } from "@/server/shared/response";
import { ERROR_CODES } from "@/server/shared/error-codes";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readSession();
  if (!session) return fail(ERROR_CODES.UNAUTHORIZED, "unauthorized", 401);

  const category = await prisma.category.findFirst({
    where: { id, userId: session.sub },
    include: { links: { select: { id: true, name: true } }, bookmarks: { select: { id: true, title: true } } }
  });

  if (!category) return fail(ERROR_CODES.NOT_FOUND, "not found", 404);
  return ok(category);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readSession();
  if (!session) return fail(ERROR_CODES.UNAUTHORIZED, "unauthorized", 401);

  const body = (await req.json()) as { name?: string; icon?: string; color?: string; sort?: number };
  const category = await prisma.category.findFirst({ where: { id, userId: session.sub } });
  if (!category) return fail(ERROR_CODES.NOT_FOUND, "not found", 404);

  const data: { name?: string; icon?: string | null; color?: string | null; sort?: number } = {};
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.icon !== undefined) data.icon = body.icon;
  if (body.color !== undefined) data.color = body.color;
  if (body.sort !== undefined) data.sort = body.sort;

  const updated = await prisma.category.update({ where: { id }, data });
  return ok(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await readSession();
  if (!session) return fail(ERROR_CODES.UNAUTHORIZED, "unauthorized", 401);

  const category = await prisma.category.findFirst({ where: { id, userId: session.sub } });
  if (!category) return fail(ERROR_CODES.NOT_FOUND, "not found", 404);

  await prisma.category.delete({ where: { id } });
  return ok({ deleted: true });
}
