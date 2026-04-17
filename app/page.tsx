import type { Metadata } from "next";
import { cookies } from "next/headers";
import { HomePage } from "@/features/home/home-page";
import { getHomeMetadata, getHomePageData } from "@/server/home/home-data";
import { readSession } from "@/server/auth/middleware";
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
    sessionUser = {
      userId: 0,
      groupId: 0,
      manager: session.role === "admin" || session.role === "superadmin",
      email: session.email,
      nickname: session.login,
      avatar: AVATAR_FALLBACK
    };
  }

  const data = await getHomePageData({
    userId: cookieStore.get("user_id")?.value ?? "",
    token: cookieStore.get("token")?.value ?? "",
    sessionUser
  });

  return <HomePage data={data} />;
}
