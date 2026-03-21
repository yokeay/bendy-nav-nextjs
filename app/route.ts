import { NextRequest } from "next/server";
import { dispatchLegacyRoute } from "@/server/router/legacy-router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return dispatchLegacyRoute(request, []);
}

export async function POST(request: NextRequest) {
  return dispatchLegacyRoute(request, []);
}

export async function PUT(request: NextRequest) {
  return dispatchLegacyRoute(request, []);
}

export async function DELETE(request: NextRequest) {
  return dispatchLegacyRoute(request, []);
}

export async function PATCH(request: NextRequest) {
  return dispatchLegacyRoute(request, []);
}

export async function OPTIONS(request: NextRequest) {
  return dispatchLegacyRoute(request, []);
}