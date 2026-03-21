import type { NextRequest, NextResponse } from "next/server";
import type { RequestScope } from "@/server/shared/types/request-scope";
import { handleLegacyRequest } from "@/server/legacy/handler";

export type CompatibilityRequest = {
  request: NextRequest;
  pathSegments: string[];
  scope: RequestScope;
};

export async function processLegacyCompatibilityRequest(
  payload: CompatibilityRequest
): Promise<NextResponse> {
  // Keep endpoint behavior unchanged while we enforce package boundaries above this layer.
  return handleLegacyRequest(payload.request, payload.pathSegments);
}
