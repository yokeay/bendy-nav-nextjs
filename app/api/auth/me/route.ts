import { NextResponse } from "next/server";
import prisma from "@/server/infrastructure/db/prisma";
import { readSession } from "@/server/auth/middleware";

export async function GET() {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ code: 0, message: "ok", data: { authenticated: false } });
  }
  const profile = await prisma.user.findUnique({
    where: { id: session.sub },
    select: { name: true, avatarUrl: true }
  });
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
        name: profile?.name ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
        reauthAt: session.reauthAt ?? null
      }
    }
  });
}
