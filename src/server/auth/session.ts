// Session layer: short-lived access JWT + refresh token tracked via cache.
// Tokens are signed with HS256 using SESSION_JWT_SECRET. Refresh `jti` is stored in
// CacheDriver at `bendy:sess:{jti}` and deleted on logout/revoke.

import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { getCache, cacheKey } from "@/server/infrastructure/cache";

export const SESSION_COOKIE_ACCESS = "bendy_session";
export const SESSION_COOKIE_REFRESH = "bendy_refresh";

export type SessionRole = "user" | "admin" | "superadmin";

export interface SessionClaims extends JWTPayload {
  sub: string;
  role: SessionRole;
  login: string;
  email: string;
  jti: string;
  typ: "access" | "refresh";
  reauthAt?: number;
}

function secret(): Uint8Array {
  const raw = process.env.SESSION_JWT_SECRET;
  if (!raw || raw.length < 16) {
    throw new Error("SESSION_JWT_SECRET is missing or too short (>= 16 chars).");
  }
  return new TextEncoder().encode(raw);
}

function accessTtl(): number {
  return Number(process.env.SESSION_ACCESS_TTL ?? 900);
}

function refreshTtl(): number {
  return Number(process.env.SESSION_REFRESH_TTL ?? 14 * 24 * 3600);
}

export function newJti(): string {
  return randomBytes(16).toString("hex");
}

export async function signAccessToken(params: {
  userId: string;
  role: SessionRole;
  login: string;
  email: string;
  reauthAt?: number;
}): Promise<{ token: string; expiresAt: Date; jti: string }> {
  const jti = newJti();
  const ttl = accessTtl();
  const expiresAt = new Date(Date.now() + ttl * 1000);
  const token = await new SignJWT({
    role: params.role,
    login: params.login,
    email: params.email,
    typ: "access",
    reauthAt: params.reauthAt
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.userId)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret());
  return { token, expiresAt, jti };
}

export async function signRefreshToken(params: {
  userId: string;
  role: SessionRole;
  login: string;
  email: string;
}): Promise<{ token: string; jti: string; expiresAt: Date }> {
  const jti = newJti();
  const ttl = refreshTtl();
  const expiresAt = new Date(Date.now() + ttl * 1000);
  const token = await new SignJWT({
    role: params.role,
    login: params.login,
    email: params.email,
    typ: "refresh"
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.userId)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret());
  await getCache().set(cacheKey("sess", jti), { userId: params.userId, role: params.role }, ttl);
  return { token, jti, expiresAt };
}

export async function verifyToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify<SessionClaims>(token, secret());
    return payload;
  } catch {
    return null;
  }
}

export async function isRefreshActive(jti: string): Promise<boolean> {
  const hit = await getCache().get(cacheKey("sess", jti));
  return Boolean(hit);
}

export async function revokeRefresh(jti: string): Promise<void> {
  await getCache().delete(cacheKey("sess", jti));
}
