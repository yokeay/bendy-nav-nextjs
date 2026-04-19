import type { NextRequest } from "next/server";
import prisma from "@/server/infrastructure/db/prisma";
import { requireAuth, getClientIp } from "@/server/auth/middleware";
import { ok, fail } from "@/server/shared/response";
import { ERROR_CODES } from "@/server/shared/error-codes";
import { writeAudit } from "@/server/admin/audit/writer";

const MAX_NAME_LEN = 64;
const MAX_AVATAR_LEN = 512;

export async function PATCH(req: NextRequest) {
  let session;
  try {
    session = await requireAuth();
  } catch (res) {
    return res as Response;
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: unknown;
    avatarUrl?: unknown;
  };

  const patch: { name?: string | null; avatarUrl?: string | null } = {};

  if (body.name !== undefined) {
    if (body.name === null || body.name === "") {
      patch.name = null;
    } else if (typeof body.name !== "string") {
      return fail(ERROR_CODES.VALIDATION, "name must be a string");
    } else {
      const trimmed = body.name.trim();
      if (trimmed.length > MAX_NAME_LEN) {
        return fail(ERROR_CODES.VALIDATION, `name too long (max ${MAX_NAME_LEN})`);
      }
      patch.name = trimmed;
    }
  }

  if (body.avatarUrl !== undefined) {
    if (body.avatarUrl === null || body.avatarUrl === "") {
      patch.avatarUrl = null;
    } else if (typeof body.avatarUrl !== "string") {
      return fail(ERROR_CODES.VALIDATION, "avatarUrl must be a string");
    } else {
      const trimmed = body.avatarUrl.trim();
      if (trimmed.length > MAX_AVATAR_LEN) {
        return fail(ERROR_CODES.VALIDATION, `avatarUrl too long (max ${MAX_AVATAR_LEN})`);
      }
      if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith("/")) {
        return fail(ERROR_CODES.VALIDATION, "avatarUrl must be http(s) or absolute path");
      }
      patch.avatarUrl = trimmed;
    }
  }

  if (patch.name === undefined && patch.avatarUrl === undefined) {
    return fail(ERROR_CODES.VALIDATION, "no fields to update");
  }

  const user = await prisma.user.update({
    where: { id: session.sub },
    data: patch,
    select: { id: true, name: true, avatarUrl: true, email: true, login: true }
  });

  await writeAudit({
    actorId: session.sub,
    action: "user.profile.update",
    targetType: "user",
    targetId: session.sub,
    payload: patch,
    ip: getClientIp(req)
  });

  return ok(user);
}
