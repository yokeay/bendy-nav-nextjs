import { NextResponse, type NextRequest } from "next/server";
import { readSession } from "@/server/auth/middleware";

// Entry point for "sensitive operation re-auth". Client calls GET with optional `?returnTo=`.
// We redirect to /api/auth/github/start with mode=reauth so the callback remints the session
// with a fresh `reauthAt` timestamp, unlocking endpoints guarded by requireReauth().
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const session = await readSession();
  if (!session) {
    return NextResponse.redirect(new URL("/api/auth/github/start", url).toString());
  }
  const returnTo = url.searchParams.get("returnTo") ?? "/";
  const next = new URL("/api/auth/github/start", url);
  next.searchParams.set("mode", "reauth");
  next.searchParams.set("returnTo", returnTo);
  return NextResponse.redirect(next.toString());
}
