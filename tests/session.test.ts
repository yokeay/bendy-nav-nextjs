import { describe, it, expect, beforeEach } from "vitest";
import { signAccessToken, signRefreshToken, verifyToken, isRefreshActive, revokeRefresh } from "../src/server/auth/session";

beforeEach(() => {
  process.env.SESSION_JWT_SECRET = "test-secret-at-least-32-characters-ok";
  process.env.CACHE_DRIVER = "memory";
  process.env.BUSINESS_PREFIX = "bendy";
  process.env.SESSION_ACCESS_TTL = "900";
  process.env.SESSION_REFRESH_TTL = "3600";
});

describe("session", () => {
  it("signs and verifies an access token", async () => {
    const signed = await signAccessToken({
      userId: "u1",
      role: "admin",
      login: "alice",
      email: "alice@example.com"
    });
    const claims = await verifyToken(signed.token);
    expect(claims?.sub).toBe("u1");
    expect(claims?.role).toBe("admin");
    expect(claims?.typ).toBe("access");
    expect(claims?.login).toBe("alice");
  });

  it("refresh token is active until revoked", async () => {
    const signed = await signRefreshToken({
      userId: "u2",
      role: "user",
      login: "bob",
      email: "bob@example.com"
    });
    expect(await isRefreshActive(signed.jti)).toBe(true);
    await revokeRefresh(signed.jti);
    expect(await isRefreshActive(signed.jti)).toBe(false);
  });

  it("rejects tampered tokens", async () => {
    const signed = await signAccessToken({
      userId: "u3",
      role: "user",
      login: "carol",
      email: "c@e.com"
    });
    const tampered = signed.token.slice(0, -4) + "XXXX";
    expect(await verifyToken(tampered)).toBeNull();
  });

  it("carries reauthAt claim when provided", async () => {
    const now = Math.floor(Date.now() / 1000);
    const signed = await signAccessToken({
      userId: "u4",
      role: "superadmin",
      login: "root",
      email: "r@e.com",
      reauthAt: now
    });
    const claims = await verifyToken(signed.token);
    expect(claims?.reauthAt).toBe(now);
  });
});
