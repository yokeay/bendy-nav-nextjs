import type { NextRequest } from "next/server";
import { ok } from "@/server/shared/response";
import { requireRole } from "@/server/auth/middleware";
import { listAdminCards } from "@/server/cards/card-service";
import { listSubmissions } from "@/server/cards/submission-service";

export async function GET(req: NextRequest) {
  try {
    await requireRole(["admin", "superadmin"]);
  } catch (res) {
    return res as Response;
  }

  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "submissions";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);
  const status = url.searchParams.get("status") ?? undefined;
  const keyword = url.searchParams.get("keyword") ?? undefined;

  if (scope === "cards") {
    const result = await listAdminCards({ page, status, keyword });
    return ok({ scope, ...result });
  }

  const result = await listSubmissions({ page, status, keyword });
  return ok({ scope: "submissions", ...result });
}
