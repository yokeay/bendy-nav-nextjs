import type { NextRequest } from "next/server";
import { requireRole, requireReauth, getClientIp } from "@/server/auth/middleware";
import { ok, fail } from "@/server/shared/response";
import { ERROR_CODES } from "@/server/shared/error-codes";
import {
  getUser,
  updateUser,
  softDeleteUser,
  EmailConflictError,
  type UserProfilePatch
} from "@/server/admin/users/service";
import { writeAudit } from "@/server/admin/audit/writer";
import type { Role, UserStatus } from "@prisma/client";

const ALLOWED_ROLES: Role[] = ["user", "admin", "superadmin"];
const ALLOWED_STATUSES: UserStatus[] = ["active", "disabled"];
const MAX_NAME_LEN = 64;
const MAX_AVATAR_LEN = 512;
const MAX_EMAIL_LEN = 254;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(["admin", "superadmin"]);
  } catch (res) {
    return res as Response;
  }
  const { id } = await ctx.params;
  const user = await getUser(id);
  if (!user) return fail(ERROR_CODES.NOT_FOUND, "user not found", 404);
  return ok(user);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let actor;
  try {
    actor = await requireRole(["admin", "superadmin"]);
  } catch (res) {
    return res as Response;
  }
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => ({}))) as {
    role?: string;
    status?: string;
    name?: unknown;
    avatarUrl?: unknown;
    email?: unknown;
  };
  const patch: UserProfilePatch = {};

  if (body.role) {
    if (!ALLOWED_ROLES.includes(body.role as Role)) {
      return fail(ERROR_CODES.VALIDATION, "invalid role");
    }
    patch.role = body.role as Role;
  }
  if (body.status) {
    if (!ALLOWED_STATUSES.includes(body.status as UserStatus)) {
      return fail(ERROR_CODES.VALIDATION, "invalid status");
    }
    patch.status = body.status as UserStatus;
  }

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

  if (body.email !== undefined) {
    if (typeof body.email !== "string") {
      return fail(ERROR_CODES.VALIDATION, "email must be a string");
    }
    const trimmed = body.email.trim();
    if (!trimmed) {
      return fail(ERROR_CODES.VALIDATION, "email cannot be empty");
    }
    if (trimmed.length > MAX_EMAIL_LEN) {
      return fail(ERROR_CODES.VALIDATION, `email too long (max ${MAX_EMAIL_LEN})`);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return fail(ERROR_CODES.VALIDATION, "invalid email format");
    }
    patch.email = trimmed;
  }

  if (Object.keys(patch).length === 0) {
    return fail(ERROR_CODES.VALIDATION, "no fields to update");
  }

  // Role change requires re-auth
  if (patch.role) {
    try {
      await requireReauth();
    } catch (res) {
      return res as Response;
    }
  }

  let user;
  try {
    user = await updateUser(id, patch);
  } catch (err) {
    if (err instanceof EmailConflictError) {
      return fail(ERROR_CODES.CONFLICT, "email already in use", 409);
    }
    throw err;
  }

  const action = patch.role
    ? "user.role.change"
    : patch.name !== undefined || patch.avatarUrl !== undefined || patch.email !== undefined
      ? "user.profile.update"
      : patch.status === "disabled"
        ? "user.disable"
        : "user.enable";

  await writeAudit({
    actorId: actor.sub,
    action,
    targetType: "user",
    targetId: id,
    payload: JSON.parse(JSON.stringify(patch)),
    ip: getClientIp(req)
  });
  return ok(user);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let actor;
  try {
    actor = await requireRole(["superadmin"]);
    await requireReauth();
  } catch (res) {
    return res as Response;
  }
  const { id } = await ctx.params;
  await softDeleteUser(id);
  await writeAudit({
    actorId: actor.sub,
    action: "user.delete",
    targetType: "user",
    targetId: id,
    ip: getClientIp(req)
  });
  return ok({ id });
}
