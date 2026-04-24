import type { NextRequest } from "next/server";
import { randomBytes } from "node:crypto";
import prisma from "@/server/infrastructure/db/prisma";
import { requireAuth, getClientIp } from "@/server/auth/middleware";
import { ok, fail } from "@/server/shared/response";
import { ERROR_CODES } from "@/server/shared/error-codes";
import { writeAudit } from "@/server/admin/audit/writer";

function maskToken(token: string): string {
  if (token.length < 8) return "••••";
  return `${token.slice(0, 4)}••••${token.slice(-4)}`;
}

export async function GET(_req: NextRequest) {
  let session;
  try {
    session = await requireAuth();
  } catch (res) {
    return res as Response;
  }

  const user = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { importToken: true }
  });

  if (!user) {
    return fail(ERROR_CODES.NOT_FOUND, "user not found", 404);
  }

  return ok({
    hasToken: !!user.importToken,
    token: user.importToken ? maskToken(user.importToken) : null
  });
}

export async function POST(req: NextRequest) {
  let session;
  try {
    session = await requireAuth();
  } catch (res) {
    return res as Response;
  }

  const body = (await req.json().catch(() => ({}))) as { action?: unknown };
  const action = typeof body.action === "string" ? body.action : "generate";

  if (action === "revoke") {
    await prisma.user.update({
      where: { id: session.sub },
      data: { importToken: null }
    });
    await writeAudit({
      actorId: session.sub,
      action: "user.importToken.revoke",
      targetType: "user",
      targetId: session.sub,
      payload: {},
      ip: getClientIp(req)
    });
    return ok({ token: null, hasToken: false });
  }

  // Default: generate new token
  const newToken = randomBytes(24).toString("hex");
  await prisma.user.update({
    where: { id: session.sub },
    data: { importToken: newToken }
  });
  await writeAudit({
    actorId: session.sub,
    action: "user.importToken.generate",
    targetType: "user",
    targetId: session.sub,
    payload: {},
    ip: getClientIp(req)
  });

  return ok({ token: newToken, hasToken: true });
}
