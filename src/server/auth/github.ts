// GitHub OAuth client. No extra SDK — plain fetch calls keep the dependency surface small.
// Flow: /authorize -> callback -> exchange code -> fetch user + emails.

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";

export interface GitHubConfig {
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
}

export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

export function readGitHubConfig(): GitHubConfig {
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:3000";
  const path = process.env.GITHUB_OAUTH_CALLBACK_PATH ?? "/api/auth/github/callback";
  if (!clientId || !clientSecret) {
    throw new Error("GITHUB_OAUTH_CLIENT_ID / GITHUB_OAUTH_CLIENT_SECRET not configured.");
  }
  return {
    clientId,
    clientSecret,
    callbackUrl: new URL(path, baseUrl).toString()
  };
}

export function buildAuthorizeUrl(config: GitHubConfig, state: string, scope = "read:user user:email"): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.callbackUrl,
    scope,
    state,
    allow_signup: "true"
  });
  return `${GITHUB_AUTHORIZE_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(config: GitHubConfig, code: string): Promise<string> {
  const res = await fetch(GITHUB_TOKEN_URL, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.callbackUrl
    })
  });
  if (!res.ok) {
    throw new Error(`GitHub token exchange failed: HTTP ${res.status}`);
  }
  const payload = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!payload.access_token) {
    throw new Error(`GitHub token exchange error: ${payload.error ?? "unknown"} ${payload.error_description ?? ""}`.trim());
  }
  return payload.access_token;
}

async function githubGet<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${url} failed: HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function fetchGitHubUser(accessToken: string): Promise<GitHubUser> {
  const raw = await githubGet<{
    id: number;
    login: string;
    name: string | null;
    email: string | null;
    avatar_url: string | null;
  }>(GITHUB_USER_URL, accessToken);
  return {
    id: raw.id,
    login: raw.login,
    name: raw.name,
    email: raw.email,
    avatarUrl: raw.avatar_url
  };
}

export async function fetchGitHubEmails(accessToken: string): Promise<GitHubEmail[]> {
  return githubGet<GitHubEmail[]>(GITHUB_EMAILS_URL, accessToken);
}

export function pickPrimaryEmail(emails: GitHubEmail[]): string | null {
  const primary = emails.find((e) => e.primary && e.verified);
  if (primary) return primary.email;
  const anyVerified = emails.find((e) => e.verified);
  return anyVerified?.email ?? null;
}
