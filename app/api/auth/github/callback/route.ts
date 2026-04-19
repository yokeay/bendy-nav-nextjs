import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/server/infrastructure/db/prisma";
import {
  exchangeCodeForToken,
  fetchGitHubEmails,
  fetchGitHubUser,
  pickPrimaryEmail,
  readGitHubConfig
} from "@/server/auth/github";
import { getCache, cacheKey } from "@/server/infrastructure/cache";
import { rateLimit } from "@/server/auth/rate-limit";
import { getClientIp, writeSessionCookies } from "@/server/auth/middleware";
import { fail } from "@/server/shared/response";
import { ERROR_CODES } from "@/server/shared/error-codes";
import {
  OAUTH_MODE_COOKIE,
  OAUTH_RETURN_COOKIE,
  OAUTH_STATE_COOKIE
} from "@/server/auth/oauth-constants";
import type { SessionRole } from "@/server/auth/session";

function resolveRole(email: string): SessionRole {
  const list = (process.env.ADMIN_GITHUB_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const normalized = email.toLowerCase();
  if (!list.length) return "user";
  if (list[0] === normalized) return "superadmin";
  if (list.includes(normalized)) return "admin";
  return "user";
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit("oauth:callback", ip, 30, 60);
  if (!rl.allowed) {
    return fail(ERROR_CODES.RATE_LIMITED, "too many requests", 429);
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return fail(ERROR_CODES.OAUTH_FAILED, "missing code/state");
  }

  const store = await cookies();
  const cookieState = store.get(OAUTH_STATE_COOKIE)?.value;
  const mode = store.get(OAUTH_MODE_COOKIE)?.value === "reauth" ? "reauth" : "login";
  const returnTo = store.get(OAUTH_RETURN_COOKIE)?.value ?? "/";

  if (!cookieState || cookieState !== state) {
    return fail(ERROR_CODES.OAUTH_FAILED, "state mismatch");
  }
  const cached = await getCache().get(cacheKey("oauth:state", state));
  if (!cached) {
    return fail(ERROR_CODES.OAUTH_FAILED, "state expired");
  }
  await getCache().delete(cacheKey("oauth:state", state));

  let config;
  try {
    config = readGitHubConfig();
  } catch (err) {
    return fail(ERROR_CODES.OAUTH_FAILED, (err as Error).message, 500);
  }

  let accessToken: string;
  try {
    accessToken = await exchangeCodeForToken(config, code);
  } catch (err) {
    return fail(ERROR_CODES.OAUTH_FAILED, (err as Error).message, 502);
  }

  const ghUser = await fetchGitHubUser(accessToken);
  const emails = await fetchGitHubEmails(accessToken);
  const email = ghUser.email ?? pickPrimaryEmail(emails);
  if (!email) {
    return fail(ERROR_CODES.OAUTH_FAILED, "no verified email on GitHub account");
  }

  const role = resolveRole(email);

  const user = await prisma.user.upsert({
    where: { githubId: String(ghUser.id) },
    update: {
      email,
      login: ghUser.login,
      name: ghUser.name ?? undefined,
      avatarUrl: ghUser.avatarUrl ?? undefined,
      role,
      lastLoginAt: new Date()
    },
    create: {
      githubId: String(ghUser.id),
      email,
      login: ghUser.login,
      name: ghUser.name ?? undefined,
      avatarUrl: ghUser.avatarUrl ?? undefined,
      role,
      lastLoginAt: new Date()
    }
  });

  const reauthAt = mode === "reauth" ? Math.floor(Date.now() / 1000) : undefined;

  await writeSessionCookies({
    userId: user.id,
    role: user.role as SessionRole,
    login: user.login,
    email: user.email,
    reauthAt
  });

  const res = NextResponse.redirect(new URL(returnTo, url).toString());
  res.cookies.delete(OAUTH_STATE_COOKIE);
  res.cookies.delete(OAUTH_MODE_COOKIE);
  res.cookies.delete(OAUTH_RETURN_COOKIE);
  return res;
}
