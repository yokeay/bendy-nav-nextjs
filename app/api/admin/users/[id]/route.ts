import type { NextRequest } from "next/server";
import { requireRole, requireReauth, getClientIp } from "@/server/auth/middleware";
import { ok, fail } from "@/server/shared/response";
import { ERROR_CODES } from "@/server/shared/error-codes";
import {
  getUser,
  updateUser,
  softDeleteUser
} from "@/server/admin/users/service";
import { writeAudit } from "@/server/admin/audit/writer";
import type { Role, UserStatus } from "@prisma/client";

const ALLOWED_ROLES: Role[] = ["user", "admin", "superadmin"];
const ALLOWED_STATUSES: UserStatus[] = ["active", "disabled"];

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

  const body = (await req.json().catch(() => ({}))) as { role?: string; status?: string };
  const patch: { role?: Role; status?: UserStatus } = {};
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
  if (!patch.role && !patch.status) {
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

  const user = await updateUser(id, patch);
  await writeAudit({
    actorId: actor.sub,
    action: patch.role ? "user.role.change" : patch.status === "disabled" ? "user.disable" : "user.enable",
    targetType: "user",
    targetId: id,
    payload: patch,
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
