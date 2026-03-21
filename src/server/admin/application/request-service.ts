import type { NextRequest, NextResponse } from "next/server";
import type { RequestScope } from "@/server/shared/types/request-scope";
import { processLegacyCompatibilityRequest } from "@/server/legacy/application/compatibility-service";

export async function processAdminRequest(
  request: NextRequest,
  pathSegments: string[]
): Promise<NextResponse> {
  return processLegacyCompatibilityRequest({
    request,
    pathSegments,
    scope: "admin"
  } satisfies {
    request: NextRequest;
    pathSegments: string[];
    scope: RequestScope;
  });
}
