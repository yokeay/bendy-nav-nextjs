import type { NextRequest, NextResponse } from "next/server";
import { resolveRequestScope } from "@/server/admin/policy/scope-policy";
import { dispatchAdminRequest } from "@/server/admin/entry";
import { dispatchClientRequest } from "@/server/client/entry";

export async function dispatchLegacyRoute(
  request: NextRequest,
  pathSegments: string[]
): Promise<NextResponse> {
  const scope = resolveRequestScope(pathSegments);

  if (scope === "admin") {
    return dispatchAdminRequest(request, pathSegments);
  }

  return dispatchClientRequest(request, pathSegments);
}
