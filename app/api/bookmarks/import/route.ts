import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import prisma from "@/server/infrastructure/db/prisma";
import sql from "@/server/infrastructure/db/client";
import { ok, fail } from "@/server/shared/response";
import { ERROR_CODES } from "@/server/shared/error-codes";
import { writeAudit } from "@/server/admin/audit/writer";
import { getClientIp, readSession } from "@/server/auth/middleware";
import {
  mapBookmarkToDraft,
  mapBookmarkToHomeLink,
  newBatchId,
  parseNetscapeBookmarks,
  validateBookmarkBatch,
  type BookmarkInput,
  type BookmarkSource,
  type HomeLinkJson
} from "@/server/bookmarks/import-service";

type RequestBody = {
  userId?: unknown;
  bookmarks?: unknown;
  html?: unknown;
  source?: unknown;
  writeHomeTile?: unknown;
};

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as RequestBody;

  const authResult = await resolveAuth(req, body);
  if (authResult.ok !== true) {
    return authResult.response;
  }
  const { userId, actor } = authResult;

  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: { id: true, email: true }
  });
  if (!user) {
    return fail(ERROR_CODES.NOT_FOUND, "user not found", 404);
  }

  let rawList: unknown = body.bookmarks;
  let sourceLabel: BookmarkSource = "api";

  if (typeof body.source === "string" && body.source.trim()) {
    const s = body.source.trim().toLowerCase();
    if (s === "extension" || s === "html" || s === "manual" || s === "api") {
      sourceLabel = s;
    }
  }

  if ((!Array.isArray(rawList) || rawList.length === 0) && typeof body.html === "string" && body.html.trim()) {
    rawList = parseNetscapeBookmarks(body.html);
    sourceLabel = "html";
  }

  const validated = validateBookmarkBatch(rawList);
  if (validated.ok !== true) {
    return fail(ERROR_CODES.VALIDATION, validated.reason);
  }
  const bookmarks: BookmarkInput[] = validated.bookmarks;

  const batchId = newBatchId(sourceLabel);

  const existingMax = await prisma.bookmark.aggregate({
    where: { userId },
    _max: { sort: true }
  });
  let nextSort = (existingMax._max.sort ?? -1) + 1;

  const drafts = bookmarks.map((bm) => {
    const draft = mapBookmarkToDraft(bm, {
      userId,
      source: sourceLabel,
      batchId,
      sort: nextSort
    });
    nextSort += 1;
    return draft;
  });

  const created = await prisma.bookmark.createMany({ data: drafts });

  let homeTilesWritten = 0;
  if (body.writeHomeTile === true) {
    const linkExistingMax = await prisma.link.aggregate({
      where: { userId },
      _max: { sort: true }
    });
    let linkSort = (linkExistingMax._max.sort ?? -1) + 1;
    const linkDrafts = bookmarks.map((bm) => ({
      userId,
      name: drafts[0] ? drafts[0].title : bm.bookmark_title || bm.url || "未命名书签",
      url: String(bm.url ?? "").trim(),
      meta: {
        folder_path: bm.folder_path ?? "",
        tags: bm.tags ?? "",
        page_title: bm.page_title ?? "",
        page_description: bm.page_description ?? "",
        generated_description: bm.generated_description ?? "",
        date_added: bm.date_added ?? "",
        bookmark_id: bm.bookmark_id ?? "",
        crawl_error: bm.crawl_error ?? "",
        source: sourceLabel,
        batchId
      },
      sort: linkSort++
    }));
    await prisma.link.createMany({ data: linkDrafts });
    homeTilesWritten = linkDrafts.length;
  }

  const legacyWritten = await writeLegacyLinks(user.email, bookmarks);

  await writeAudit({
    actorId: actor,
    action: "bookmark.import",
    targetType: "user",
    targetId: userId,
    payload: { count: created.count, source: sourceLabel, batchId, legacyWritten, homeTilesWritten },
    ip: getClientIp(req)
  });

  return ok({
    imported: created.count,
    batchId,
    source: sourceLabel,
    homeTilesWritten,
    legacyWritten
  });
}

type AuthResolution =
  | { ok: true; userId: string; actor: string | null }
  | { ok: false; response: Response };

async function resolveAuth(req: NextRequest, body: RequestBody): Promise<AuthResolution> {
  const apiKey = process.env.BOOKMARK_IMPORT_API_KEY;
  const provided = req.headers.get("x-api-key");
  if (apiKey && provided && provided === apiKey) {
    if (typeof body.userId !== "string" || !body.userId.trim()) {
      return { ok: false, response: fail(ERROR_CODES.VALIDATION, "userId is required when using api key") };
    }
    return { ok: true, userId: body.userId.trim(), actor: null };
  }

  const session = await readSession();
  if (session) {
    const fallbackUserId = typeof body.userId === "string" && body.userId.trim() ? body.userId.trim() : session.sub;
    if (fallbackUserId !== session.sub && session.role !== "admin" && session.role !== "superadmin") {
      return { ok: false, response: fail(ERROR_CODES.FORBIDDEN, "cannot import for another user", 403) };
    }
    return { ok: true, userId: fallbackUserId, actor: session.sub };
  }

  if (provided) {
    return { ok: false, response: fail(ERROR_CODES.FORBIDDEN, "invalid api key", 403) };
  }
  if (!apiKey) {
    return { ok: false, response: fail(ERROR_CODES.FORBIDDEN, "bookmark import disabled (BOOKMARK_IMPORT_API_KEY unset or no session)", 403) };
  }
  return { ok: false, response: fail(ERROR_CODES.UNAUTHORIZED, "authentication required", 401) };
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
