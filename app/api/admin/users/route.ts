import type { NextRequest } from "next/server";
import { requireRole, getClientIp } from "@/server/auth/middleware";
import { ok, fail } from "@/server/shared/response";
import { ERROR_CODES } from "@/server/shared/error-codes";
import { listUsers } from "@/server/admin/users/service";
import type { Role, UserStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requireRole(["admin", "superadmin"]);
  } catch (res) {
    return res as Response;
  }
  void getClientIp;

  const url = new URL(req.url);
  const keyword = url.searchParams.get("keyword") ?? undefined;
  const role = (url.searchParams.get("role") ?? undefined) as Role | undefined;
  const status = (url.searchParams.get("status") ?? undefined) as UserStatus | undefined;
  const page = Number(url.searchParams.get("page") ?? 1);
  const pageSize = Number(url.searchParams.get("pageSize") ?? 20);

  try {
    const data = await listUsers({ keyword, role, status, page, pageSize });
    return ok(data);
  } catch (err) {
    return fail(ERROR_CODES.INTERNAL, (err as Error).message, 500);
  }
}
