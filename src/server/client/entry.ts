import type { NextRequest, NextResponse } from "next/server";
import { processClientRequest } from "@/server/client/application/request-service";

export async function dispatchClientRequest(
  request: NextRequest,
  pathSegments: string[]
): Promise<NextResponse> {
  return processClientRequest(request, pathSegments);
}
