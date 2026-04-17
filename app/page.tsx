import type { Metadata } from "next";
import { cookies } from "next/headers";
import { HomePage } from "@/features/home/home-page";
import { getHomeMetadata, getHomePageData } from "@/server/home/home-data";

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

export default async function Page() {
  const cookieStore = await cookies();
  const data = await getHomePageData({
    userId: cookieStore.get("user_id")?.value ?? "",
    token: cookieStore.get("token")?.value ?? ""
  });

  return <HomePage data={data} />;
}
