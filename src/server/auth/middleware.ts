import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  SESSION_COOKIE_ACCESS,
  SESSION_COOKIE_REFRESH,
  signAccessToken,
  signRefreshToken,
  verifyToken,
  type SessionClaims,
  type SessionRole
} from "./session";

const REAUTH_WINDOW_SECONDS = 5 * 60;

function isProd() {
  return process.env.NODE_ENV === "production";
}

export async function writeSessionCookies(params: {
  userId: string;
  role: SessionRole;
  login: string;
  email: string;
  reauthAt?: number;
}): Promise<void> {
  const access = await signAccessToken(params);
  const refresh = await signRefreshToken(params);
  const store = await cookies();
  store.set(SESSION_COOKIE_ACCESS, access.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd(),
    path: "/",
    expires: access.expiresAt
  });
  store.set(SESSION_COOKIE_REFRESH, refresh.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd(),
    path: "/",
    expires: refresh.expiresAt
  });
}

export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE_ACCESS);
  store.delete(SESSION_COOKIE_REFRESH);
}

export async function readSession(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_ACCESS)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function requireAuth(): Promise<SessionClaims> {
  const claims = await readSession();
  if (!claims || claims.typ !== "access") {
    throw unauthorized();
  }
  return claims;
}

export async function requireRole(roles: SessionRole[]): Promise<SessionClaims> {
  const claims = await requireAuth();
  if (!roles.includes(claims.role)) {
    throw forbidden();
  }
  return claims;
}

export async function requireReauth(): Promise<SessionClaims> {
  const claims = await requireAuth();
  const now = Math.floor(Date.now() / 1000);
  if (!claims.reauthAt || now - claims.reauthAt > REAUTH_WINDOW_SECONDS) {
    throw reauthRequired();
  }
  return claims;
}

export function unauthorized(): Response {
  return NextResponse.json({ code: 1001, message: "unauthorized" }, { status: 401 });
}

export function forbidden(): Response {
  return NextResponse.json({ code: 1002, message: "forbidden" }, { status: 403 });
}

export function reauthRequired(): Response {
  return NextResponse.json({ code: 1004, message: "re-authentication required" }, { status: 401 });
}

export function getClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
