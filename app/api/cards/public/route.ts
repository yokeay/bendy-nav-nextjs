import type { NextRequest } from "next/server";
import { ok } from "@/server/shared/response";
import { listPublicCards } from "@/server/cards/card-service";
import { toLegacyCatalogItem } from "@/server/cards/card-service";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 100;
  const featured = url.searchParams.get("featured") === "1";
  const format = url.searchParams.get("format");

  const items = await listPublicCards({ limit, featured });

  if (format === "legacy") {
    return ok({ items: items.map(toLegacyCatalogItem) });
  }

  return ok({ items });
}
