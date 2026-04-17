import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_REFRESH,
  isRefreshActive,
  revokeRefresh,
  verifyToken,
  type SessionRole
} from "@/server/auth/session";
import { clearSessionCookies, writeSessionCookies } from "@/server/auth/middleware";
import { fail } from "@/server/shared/response";
import { ERROR_CODES } from "@/server/shared/error-codes";

export async function POST() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_REFRESH)?.value;
  if (!token) {
    await clearSessionCookies();
    return fail(ERROR_CODES.UNAUTHORIZED, "no refresh token", 401);
  }

  const claims = await verifyToken(token);
  if (!claims || claims.typ !== "refresh" || !claims.jti) {
    await clearSessionCookies();
    return fail(ERROR_CODES.UNAUTHORIZED, "invalid refresh", 401);
  }
  if (!(await isRefreshActive(claims.jti))) {
    await clearSessionCookies();
    return fail(ERROR_CODES.UNAUTHORIZED, "refresh revoked", 401);
  }

  await revokeRefresh(claims.jti);
  await writeSessionCookies({
    userId: claims.sub,
    role: claims.role as SessionRole,
    login: claims.login,
    email: claims.email
  });
  return NextResponse.json({ code: 0, message: "ok", data: null });
}
