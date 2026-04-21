import { NextRequest } from "next/server";
import { ok } from "@/server/shared/response";
import { requireRole } from "@/server/auth/middleware";
import prisma from "@/server/infrastructure/db/prisma";
import { writeAudit } from "@/server/admin/audit/writer";

type LegacyCardRow = {
  id: number;
  name: string | null;
  name_en: string | null;
  version: number | string | null;
  tips: string | null;
  src: string | null;
  url: string | null;
  window: string | null;
  install_num: number | null;
  status: number | null;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

export async function POST(req: NextRequest) {
  let actor: { sub: string };
  try {
    actor = await requireRole(["admin", "superadmin"]);
  } catch (res) {
    return res as Response;
  }

  let legacyRows: LegacyCardRow[] = [];
  try {
    const raw = await prisma.$queryRawUnsafe<LegacyCardRow[]>(
      `SELECT id, name, name_en, version, tips, src, url, "window", install_num, status FROM card WHERE status = 1`
    );
    legacyRows = Array.isArray(raw) ? raw : [];
  } catch {
    return ok({ migrated: 0, skipped: 0, message: "Legacy card table not found or empty" });
  }

  let migrated = 0;
  let skipped = 0;

  for (const row of legacyRows) {
    const nameEn = (row.name_en ?? "").trim();
    if (!nameEn) {
      skipped++;
      continue;
    }

    const slug = slugify(nameEn);
    if (!slug || slug.length < 2) {
      skipped++;
      continue;
    }

    const entryUrl = (row.url ?? "").trim();
    const windowUrl = (row.window ?? "").trim();
    const host = windowUrl ? "window" : "iframe";

    try {
      await prisma.bendyCard.upsert({
        where: { slug },
        update: {
          name: (row.name ?? "").trim() || nameEn,
          nameEn,
          tips: (row.tips ?? "").trim(),
          icon: (row.src ?? "").trim(),
          entryUrl: entryUrl || windowUrl,
          host,
          version: String(row.version ?? "1.0.0"),
          installNum: row.install_num ?? 0,
          status: "approved",
          publishedAt: new Date()
        },
        create: {
          slug,
          name: (row.name ?? "").trim() || nameEn,
          nameEn,
          tips: (row.tips ?? "").trim(),
          icon: (row.src ?? "").trim(),
          entryUrl: entryUrl || windowUrl,
          host,
          size: "2x4",
          version: String(row.version ?? "1.0.0"),
          installNum: row.install_num ?? 0,
          status: "approved",
          isFeatured: false,
          publishedAt: new Date(),
          authorName: "legacy-migration"
        }
      });
      migrated++;
    } catch {
      skipped++;
    }
  }

  await writeAudit({
    actorId: actor.sub,
    action: "card.migrate_legacy",
    targetType: "card",
    payload: { migrated, skipped, total: legacyRows.length }
  });

  return ok({ migrated, skipped, total: legacyRows.length });
}
