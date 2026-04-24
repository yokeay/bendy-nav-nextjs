import { NextResponse, type NextRequest } from "next/server";
import { readSession } from "@/server/auth/middleware";

// Entry point for "sensitive operation re-auth". Client calls GET with optional `?returnTo=`.
// We redirect to /api/auth/github/start with mode=reauth so the callback remints the session
// with a fresh `reauthAt` timestamp, unlocking endpoints guarded by requireReauth().
export async function GET(req: NextRequest) {
  const baseUrl = process.env.APP_BASE_URL ?? "http://127.0.0.1:3000";
  const session = await readSession();
  if (!session) {
    return NextResponse.redirect(new URL("/api/auth/github/start", baseUrl).toString());
  }
  const returnTo = req.nextUrl.searchParams.get("returnTo") ?? "/";
  const next = new URL("/api/auth/github/start", baseUrl);
  next.searchParams.set("mode", "reauth");
  next.searchParams.set("returnTo", returnTo);
  return NextResponse.redirect(next.toString());
}
