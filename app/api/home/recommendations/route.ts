import type { NextRequest } from "next/server";
import { ok } from "@/server/shared/response";
import { listPublicRecommendedBookmarks } from "@/server/admin/content/recommendations/service";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? 36);
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 36;
  const items = await listPublicRecommendedBookmarks(limit);
  return ok({ items });
}
