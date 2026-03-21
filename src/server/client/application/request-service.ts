import type { NextRequest, NextResponse } from "next/server";
import { processLegacyCompatibilityRequest } from "@/server/legacy/application/compatibility-service";

export async function processClientRequest(
  request: NextRequest,
  pathSegments: string[]
): Promise<NextResponse> {
  return processLegacyCompatibilityRequest({
    request,
    pathSegments,
    scope: "client"
  });
}
