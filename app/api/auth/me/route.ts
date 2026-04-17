import { NextResponse } from "next/server";
import { readSession } from "@/server/auth/middleware";

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ code: 0, message: "ok", data: { authenticated: false } });
  }
  return NextResponse.json({
    code: 0,
    message: "ok",
    data: {
      authenticated: true,
      user: {
        id: session.sub,
        login: session.login,
        email: session.email,
        role: session.role,
        reauthAt: session.reauthAt ?? null
      }
    }
  });
}
