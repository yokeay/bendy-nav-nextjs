import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_ACCESS,
  SESSION_COOKIE_REFRESH,
  revokeRefresh,
  verifyToken
} from "@/server/auth/session";
import { clearSessionCookies } from "@/server/auth/middleware";

export async function POST() {
  const store = await cookies();
  const refresh = store.get(SESSION_COOKIE_REFRESH)?.value;
  if (refresh) {
    const claims = await verifyToken(refresh);
    if (claims?.jti) {
      await revokeRefresh(claims.jti);
    }
  }
  await clearSessionCookies();
  return NextResponse.json({ code: 0, message: "ok", data: null });
}

export async function GET() {
  return POST();
}

// Silence unused imports in tree-shaken builds
void SESSION_COOKIE_ACCESS;
