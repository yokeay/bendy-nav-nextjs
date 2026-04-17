import type { NextRequest, NextResponse } from "next/server";
import { resolveRequestScope } from "@/server/admin/policy/scope-policy";

export async function dispatchLegacyRoute(
  request: NextRequest,
  pathSegments: string[]
): Promise<NextResponse> {
  const scope = resolveRequestScope(pathSegments);

  if (scope === "admin") {
    const { dispatchAdminRequest } = await import("@/server/admin/entry");
    return dispatchAdminRequest(request, pathSegments);
  }

  const { dispatchClientRequest } = await import("@/server/client/entry");
  return dispatchClientRequest(request, pathSegments);
}
