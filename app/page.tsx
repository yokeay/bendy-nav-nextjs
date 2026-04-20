import type { Metadata } from "next";
import { cookies } from "next/headers";
import { HomePage } from "@/features/home/home-page";
import { getHomeMetadata, getHomePageData } from "@/server/home/home-data";
import { readSession } from "@/server/auth/middleware";
import { bridgeSessionToLegacy } from "@/server/auth/legacy-bridge";
import prisma from "@/server/infrastructure/db/prisma";
import type { HomeUser } from "@/server/home/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const metadata = await getHomeMetadata();

  return {
    title: metadata.title,
    description: metadata.description,
    keywords: metadata.keywords,
    icons: {
      icon: metadata.favicon,
      shortcut: metadata.favicon,
      apple: metadata.logo
    }
  };
}

const AVATAR_FALLBACK = "/brand/logo-192.png";

export default async function Page() {
  const cookieStore = await cookies();
  const session = await readSession();

  let sessionUser: HomeUser | null = null;
  if (session && session.typ === "access") {
    const profile = await prisma.user.findUnique({
      where: { id: session.sub },
      select: { id: true, name: true, avatarUrl: true, email: true, login: true }
    });
    const avatar = profile?.avatarUrl?.trim() || AVATAR_FALLBACK;
    const nickname = profile?.name?.trim() || session.login;
    const bridge = await bridgeSessionToLegacy(session);
    sessionUser = {
      userId: bridge?.user_id ?? 0,
      id: session.sub,
      groupId: 0,
      manager: session.role === "admin" || session.role === "superadmin",
      email: profile?.email ?? session.email,
      nickname,
      avatar,
      name: profile?.name ?? null,
      avatarUrl: profile?.avatarUrl ?? null
    };
  }

  const data = await getHomePageData({
    userId: cookieStore.get("user_id")?.value ?? "",
    token: cookieStore.get("token")?.value ?? "",
    sessionUser
  });

  return <HomePage data={data} />;
}
