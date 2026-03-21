import type { RequestScope } from "@/server/shared/types/request-scope";

const ADMIN_FIRST_SEGMENT = "admin";

export function isAdminScopePath(pathSegments: string[]): boolean {
  const first = String(pathSegments[0] ?? "").trim().toLowerCase();
  if (!first) {
    return false;
  }
  return first === ADMIN_FIRST_SEGMENT || first.startsWith("admin.");
}

export function resolveRequestScope(pathSegments: string[]): RequestScope {
  return isAdminScopePath(pathSegments) ? "admin" : "client";
}
