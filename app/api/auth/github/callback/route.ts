import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/server/infrastructure/db/prisma";
import {
  GitHubNetworkError,
  exchangeCodeForToken,
  fetchGitHubEmails,
  fetchGitHubUser,
  pickPrimaryEmail,
  readGitHubConfig
} from "@/server/auth/github";
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

const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:3000";

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit("oauth:callback", ip, 30, 60);
  if (!rl.allowed) {
    return fail(ERROR_CODES.RATE_LIMITED, "too many requests", 429);
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
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
    const msg = err instanceof GitHubNetworkError
      ? "无法连接 GitHub 服务，请检查网络后重试。"
      : (err as Error).message;
    return NextResponse.redirect(new URL(`/?oauth_error=${encodeURIComponent(msg)}`, baseUrl).toString());
  }

  let ghUser, emails;
  try {
    ghUser = await fetchGitHubUser(accessToken);
    emails = await fetchGitHubEmails(accessToken);
  } catch (err) {
    const msg = err instanceof GitHubNetworkError
      ? "无法连接 GitHub 服务，请检查网络后重试。"
      : (err as Error).message;
    return NextResponse.redirect(new URL(`/?oauth_error=${encodeURIComponent(msg)}`, baseUrl).toString());
  }
  const email = ghUser.email ?? pickPrimaryEmail(emails);
  if (!email) {
    return NextResponse.redirect(new URL("/?oauth_error=无法获取邮箱，请确认 GitHub 账号已验证邮箱后重试。", baseUrl).toString());
  }

  const role = resolveRole(email);

  let user;
  try {
    user = await prisma.user.upsert({
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
  } catch (err) {
    return NextResponse.redirect(new URL(`/?oauth_error=${encodeURIComponent("数据库写入失败，请重试。")}`, baseUrl).toString());
  }

  const reauthAt = mode === "reauth" ? Math.floor(Date.now() / 1000) : undefined;

  await writeSessionCookies({
    userId: user.id,
    role: user.role as SessionRole,
    login: user.login,
    email: user.email,
    reauthAt
  });

  const res = NextResponse.redirect(new URL(returnTo, baseUrl).toString());
  res.cookies.delete(OAUTH_STATE_COOKIE);
  res.cookies.delete(OAUTH_MODE_COOKIE);
  res.cookies.delete(OAUTH_RETURN_COOKIE);
  return res;
}
