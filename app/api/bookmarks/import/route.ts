import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import prisma from "@/server/infrastructure/db/prisma";
import sql from "@/server/infrastructure/db/client";
import { ok, fail } from "@/server/shared/response";
import { ERROR_CODES } from "@/server/shared/error-codes";
import { writeAudit } from "@/server/admin/audit/writer";
import { getClientIp } from "@/server/auth/middleware";
import {
  mapBookmarkToHomeLink,
  mapBookmarkToPrismaLink,
  validateBookmarkBatch,
  type BookmarkInput,
  type HomeLinkJson
} from "@/server/bookmarks/import-service";

export async function POST(req: NextRequest) {
  const apiKey = process.env.BOOKMARK_IMPORT_API_KEY;
  if (!apiKey) {
    return fail(ERROR_CODES.FORBIDDEN, "bookmark import disabled (BOOKMARK_IMPORT_API_KEY unset)", 403);
  }
  const provided = req.headers.get("x-api-key");
  if (!provided || provided !== apiKey) {
    return fail(ERROR_CODES.FORBIDDEN, "invalid api key", 403);
  }

  const body = (await req.json().catch(() => ({}))) as {
    userId?: unknown;
    bookmarks?: unknown;
  };

  if (typeof body.userId !== "string" || !body.userId.trim()) {
    return fail(ERROR_CODES.VALIDATION, "userId is required");
  }
  const userId = body.userId.trim();

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, email: true }
  });
  if (!user) {
    return fail(ERROR_CODES.NOT_FOUND, "user not found", 404);
  }

  const validated = validateBookmarkBatch(body.bookmarks);
  if (validated.ok !== true) {
    return fail(ERROR_CODES.VALIDATION, validated.reason);
  }
  const bookmarks: BookmarkInput[] = validated.bookmarks;

  const existingMax = await prisma.link.aggregate({
    where: { userId },
    _max: { sort: true }
  });
  let nextSort = (existingMax._max.sort ?? -1) + 1;

  const drafts = bookmarks.map((bm) => {
    const draft = mapBookmarkToPrismaLink(bm, userId, nextSort);
    nextSort += 1;
    return draft;
  });

  await prisma.link.createMany({ data: drafts });

  const legacyWritten = await writeLegacyLinks(user.email, bookmarks);

  await writeAudit({
    actorId: null,
    action: "bookmark.import",
    targetType: "user",
    targetId: userId,
    payload: { count: drafts.length, source: "api-key", legacyWritten },
    ip: getClientIp(req)
  });

  return ok({
    imported: drafts.length,
    skipped: 0,
    legacyWritten
  });
}

async function writeLegacyLinks(email: string, bookmarks: BookmarkInput[]): Promise<boolean> {
  try {
    const rows = await sql<{ id: number }[]>`
      SELECT id
      FROM "user"
      WHERE mail = ${email}
      LIMIT 1
    `;
    const legacyUserId = rows[0]?.id;
    if (!legacyUserId) {
      return false;
    }

    const existingRows = await sql<{ link: unknown }[]>`
      SELECT link
      FROM link
      WHERE user_id = ${legacyUserId}
      LIMIT 1
    `;

    let existing: HomeLinkJson[] = [];
    if (existingRows[0]?.link) {
      const raw = existingRows[0].link;
      if (Array.isArray(raw)) {
        existing = raw as HomeLinkJson[];
      } else if (typeof raw === "string") {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) existing = parsed as HomeLinkJson[];
        } catch {
          existing = [];
        }
      }
    }

    let sortCursor = existing.reduce((max, item) => {
      const s = typeof item?.sort === "number" ? item.sort : 0;
      return s > max ? s : max;
    }, -1) + 1;

    const appended = bookmarks.map((bm) => {
      const mapped = mapBookmarkToHomeLink(bm, sortCursor, () => randomUUID());
      sortCursor += 1;
      return mapped;
    });

    const merged = [...existing, ...appended];
    const serialized = JSON.stringify(merged);

    if (existingRows.length === 0) {
      await sql`
        INSERT INTO link (user_id, link)
        VALUES (${legacyUserId}, ${serialized}::jsonb)
      `;
    } else {
      await sql`
        UPDATE link
        SET link = ${serialized}::jsonb
        WHERE user_id = ${legacyUserId}
      `;
    }

    return true;
  } catch {
    return false;
  }
}
