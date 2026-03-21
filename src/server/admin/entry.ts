import type { NextRequest, NextResponse } from "next/server";
import { processAdminRequest } from "@/server/admin/application/request-service";

export async function dispatchAdminRequest(
  request: NextRequest,
  pathSegments: string[]
): Promise<NextResponse> {
  return processAdminRequest(request, pathSegments);
}
