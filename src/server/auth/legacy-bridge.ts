// Bridges a GitHub-OAuth JWT session to the legacy numeric-id auth scheme.
// The legacy `user` / `token` / `link` / `tabbar` / `config` tables all key on
// a SERIAL integer `user_id`, while GitHub OAuth produces a CUID session
// subject. This helper upserts a legacy `user` row keyed by email and keeps a
// stable legacy token (bound to the session jti) so that legacy handlers like
// /link/update accept a session-authenticated request.

import type { NextRequest } from "next/server";
import sql from "@/lib/db";
import { readSession } from "./middleware";
import { SESSION_COOKIE_ACCESS, verifyToken, type SessionClaims } from "./session";

export type LegacyBridge = {
  user_id: number;
  token: string;
  email: string;
  create_time: number;
};

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function nowIso(): string {
  return new Date().toISOString();
}

async function upsertLegacyUserByEmail(
  email: string,
  nickname: string,
  avatar: string
): Promise<number> {
  const existing = await sql<{ id: number }[]>`
    SELECT id FROM "user" WHERE mail = ${email} LIMIT 1
  `;
  if (existing.length > 0) {
    return existing[0].id;
  }
  const inserted = await sql<{ id: number }[]>`
    INSERT INTO "user"(mail, nickname, avatar, create_time, group_id, status, manager)
    VALUES (${email}, ${nickname}, ${avatar}, ${nowIso()}, 0, 0, 0)
    RETURNING id
  `;
  return inserted[0].id;
}

async function ensureLegacyToken(userId: number, jti: string): Promise<string> {
  const legacyToken = `bendy-session:${jti}`;
  const existing = await sql<{ id: number }[]>`
    SELECT id FROM token
    WHERE user_id = ${userId} AND token = ${legacyToken}
    LIMIT 1
  `;
  if (existing.length === 0) {
    await sql`
      INSERT INTO token(user_id, token, create_time)
      VALUES (${userId}, ${legacyToken}, ${nowUnix()})
    `;
  }
  return legacyToken;
}

export async function bridgeSessionToLegacy(
  session: SessionClaims
): Promise<LegacyBridge | null> {
  if (session.typ !== "access") return null;
  const email = (session.email ?? "").trim();
  if (!email) return null;

  const nickname = (session.login ?? "").trim();
  const userId = await upsertLegacyUserByEmail(email, nickname, "");
  const token = await ensureLegacyToken(userId, session.jti);

  return {
    user_id: userId,
    token,
    email,
    create_time: nowUnix()
  };
}

export async function resolveLegacyBridge(): Promise<LegacyBridge | null> {
  const session = await readSession();
  if (!session) return null;
  return bridgeSessionToLegacy(session);
}

// Variant that reads the access token from a NextRequest's cookies so it can
// be used from inside legacy dispatchers where `next/headers` cookies() may
// not be in the expected scope.
export async function resolveLegacyBridgeFromRequest(
  request: NextRequest
): Promise<LegacyBridge | null> {
  const token = request.cookies.get(SESSION_COOKIE_ACCESS)?.value;
  if (!token) return null;
  const session = await verifyToken(token);
  if (!session) return null;
  return bridgeSessionToLegacy(session);
}

