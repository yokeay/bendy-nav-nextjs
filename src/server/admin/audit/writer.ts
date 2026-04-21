import prisma from "@/server/infrastructure/db/prisma";
import type { Prisma } from "@prisma/client";

export type AuditAction =
  | "user.login"
  | "user.logout"
  | "user.role.change"
  | "user.disable"
  | "user.enable"
  | "user.delete"
  | "user.session.revoke"
  | "content.template.publish"
  | "content.wallpaper.upload"
  | "content.wallpaper.delete"
  | "system.config.update"
  | "system.maintenance.toggle"
  | "system.backup.trigger"
  | "system.backup.cron"
  | "system.backup.restore"
  | "user.profile.update"
  | "bookmark.import"
  | "card.submit"
  | "card.update"
  | "card.approve"
  | "card.auto_approve"
  | "card.reject"
  | "card.request_changes"
  | "card.deprecate";

export interface AuditInput {
  actorId?: string | null;
  action: AuditAction | string;
  targetType?: string | null;
  targetId?: string | null;
  payload?: Prisma.InputJsonValue;
  ip?: string | null;
}

export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        payload: input.payload ?? undefined,
        ip: input.ip ?? null
      }
    });
  } catch (err) {
    // Never let audit failure break the primary operation.
    console.error("[audit] write failed", err);
  }
}
