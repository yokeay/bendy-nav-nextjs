import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { buildAuthorizeUrl, readGitHubConfig } from "@/server/auth/github";
import { getCache, cacheKey } from "@/server/infrastructure/cache";
import { rateLimit } from "@/server/auth/rate-limit";
import { getClientIp } from "@/server/auth/middleware";
import { fail } from "@/server/shared/response";
import { ERROR_CODES } from "@/server/shared/error-codes";
import {
  OAUTH_MODE_COOKIE,
  OAUTH_RETURN_COOKIE,
  OAUTH_STATE_COOKIE,
  OAUTH_STATE_TTL_SECONDS
} from "@/server/auth/oauth-constants";

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit("oauth:start", ip, 20, 60);
  if (!rl.allowed) {
    return fail(ERROR_CODES.RATE_LIMITED, "too many requests", 429);
  }

  let config;
  try {
    config = readGitHubConfig();
  } catch (err) {
    return fail(ERROR_CODES.OAUTH_FAILED, (err as Error).message, 500);
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") === "reauth" ? "reauth" : "login";
  const returnTo = url.searchParams.get("returnTo") ?? "/";

  const state = randomBytes(24).toString("hex");
  await getCache().set(cacheKey("oauth:state", state), { mode }, OAUTH_STATE_TTL_SECONDS);

  const authorizeUrl = buildAuthorizeUrl(config, state);

  const res = NextResponse.redirect(authorizeUrl);
  const commonCookie = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: OAUTH_STATE_TTL_SECONDS
  };
  res.cookies.set(OAUTH_STATE_COOKIE, state, commonCookie);
  res.cookies.set(OAUTH_MODE_COOKIE, mode, commonCookie);
  res.cookies.set(OAUTH_RETURN_COOKIE, sanitizeReturnTo(returnTo), commonCookie);
  return res;
}

function sanitizeReturnTo(raw: string): string {
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

// silence unused import — cookies() is re-exported for symmetry with other routes.
void cookies;
