import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";

export type BookmarkInput = {
  bookmark_id?: string;
  url?: string;
  bookmark_title?: string;
  folder_path?: string;
  date_added?: string | number;
  last_modified?: string | number;
  last_visited?: string | number;
  page_title?: string;
  page_description?: string;
  page_text?: string;
  generated_title?: string;
  generated_description?: string;
  crawl_error?: string;
  tags?: string;
  icon_url?: string;
  icon_data?: string;
  thumbnail_url?: string;
  is_private?: boolean;
  lang?: string;
  [extra: string]: unknown;
};

export type BookmarkSource = "extension" | "html" | "api" | "manual";

export type BookmarkDraft = {
  userId: string;
  extBookmarkId: string | null;
  url: string;
  title: string;
  folderPath: string | null;
  tags: string | null;
  lang: string | null;
  pageTitle: string | null;
  pageDescription: string | null;
  pageText: string | null;
  generatedTitle: string | null;
  generatedDescription: string | null;
  crawlError: string | null;
  iconUrl: string | null;
  iconData: string | null;
  thumbnailUrl: string | null;
  addDate: Date | null;
  lastModifiedAt: Date | null;
  lastVisitedAt: Date | null;
  isPrivate: boolean;
  source: BookmarkSource;
  sourceBatchId: string;
  sourceMeta: Prisma.InputJsonValue | null;
  sort: number;
};

export type HomeLinkJson = {
  id: string;
  app: number;
  pid: null;
  src: string;
  url: string;
  name: string;
  size: string;
  sort: number;
  type: "icon";
  bgColor: string | null;
  pageGroup: string;
  form: string;
  custom: Record<string, unknown>;
};

export function pickBookmarkName(input: BookmarkInput): string {
  return (
    input.bookmark_title?.trim() ||
    input.generated_title?.trim() ||
    input.page_title?.trim() ||
    input.url?.trim() ||
    "未命名书签"
  );
}

export function buildBookmarkMeta(input: BookmarkInput): Record<string, unknown> {
  return {
    folder_path: input.folder_path ?? "",
    tags: input.tags ?? "",
    page_title: input.page_title ?? "",
    page_description: input.page_description ?? "",
    generated_description: input.generated_description ?? "",
    date_added: input.date_added ?? "",
    bookmark_id: input.bookmark_id ?? "",
    crawl_error: input.crawl_error ?? ""
  };
}

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const raw = typeof value === "string" ? value.trim() : value;
  if (raw === "") return null;
  const num = typeof raw === "number" ? raw : Number(raw);
  if (Number.isFinite(num) && num > 0) {
    // Chrome exports ADD_DATE in seconds; browser extensions tend to send ms.
    // Heuristic: values below year-3000 in ms, and above year-2000 in sec.
    const ms = num > 1e12 ? num : num * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof raw === "string") {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function sanitizeString(value: unknown, max = 2000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export function mapBookmarkToDraft(
  input: BookmarkInput,
  context: { userId: string; source: BookmarkSource; batchId: string; sort: number }
): BookmarkDraft {
  const sourceMetaRaw = { ...input };
  // Strip known columns so sourceMeta carries only extra keys.
  const known = [
    "bookmark_id",
    "url",
    "bookmark_title",
    "folder_path",
    "date_added",
    "last_modified",
    "last_visited",
    "page_title",
    "page_description",
    "page_text",
    "generated_title",
    "generated_description",
    "crawl_error",
    "tags",
    "icon_url",
    "icon_data",
    "thumbnail_url",
    "is_private",
    "lang"
  ] as const;
  for (const key of known) {
    delete (sourceMetaRaw as Record<string, unknown>)[key];
  }

  return {
    userId: context.userId,
    extBookmarkId: sanitizeString(input.bookmark_id, 128),
    url: String(input.url ?? "").trim(),
    title: pickBookmarkName(input).slice(0, 500),
    folderPath: sanitizeString(input.folder_path, 500),
    tags: sanitizeString(input.tags, 500),
    lang: sanitizeString(input.lang, 20),
    pageTitle: sanitizeString(input.page_title, 500),
    pageDescription: sanitizeString(input.page_description, 1000),
    pageText: sanitizeString(input.page_text, 2000),
    generatedTitle: sanitizeString(input.generated_title, 500),
    generatedDescription: sanitizeString(input.generated_description, 1000),
    crawlError: sanitizeString(input.crawl_error, 500),
    iconUrl: sanitizeString(input.icon_url, 2000),
    iconData: sanitizeString(input.icon_data, 200000),
    thumbnailUrl: sanitizeString(input.thumbnail_url, 2000),
    addDate: toDate(input.date_added),
    lastModifiedAt: toDate(input.last_modified),
    lastVisitedAt: toDate(input.last_visited),
    isPrivate: input.is_private === true,
    source: context.source,
    sourceBatchId: context.batchId,
    sourceMeta:
      Object.keys(sourceMetaRaw).length > 0
        ? (sourceMetaRaw as Prisma.InputJsonValue)
        : null,
    sort: context.sort
  };
}

export function mapBookmarkToHomeLink(
  input: BookmarkInput,
  sort: number,
  idFactory: () => string
): HomeLinkJson {
  return {
    id: idFactory(),
    app: 0,
    pid: null,
    src: input.icon_url?.trim() || "/favicon.png",
    url: String(input.url ?? "").trim(),
    name: pickBookmarkName(input),
    size: "1x1",
    sort,
    type: "icon",
    bgColor: null,
    pageGroup: "",
    form: "link",
    custom: buildBookmarkMeta(input)
  };
}

export type LegacyLinkDraft = {
  userId: string;
  name: string;
  url: string;
  sort: number;
  meta: Prisma.InputJsonValue;
};

export function mapBookmarkToPrismaLink(
  input: BookmarkInput,
  userId: string,
  sort: number
): LegacyLinkDraft {
  return {
    userId,
    name: pickBookmarkName(input),
    url: String(input.url ?? "").trim(),
    sort,
    meta: buildBookmarkMeta(input) as Prisma.InputJsonValue
  };
}

export function validateBookmarkBatch(list: unknown): {
  ok: true;
  bookmarks: BookmarkInput[];
} | { ok: false; reason: string } {
  if (!Array.isArray(list)) {
    return { ok: false, reason: "bookmarks must be an array" };
  }
  if (list.length === 0) {
    return { ok: false, reason: "bookmarks is empty" };
  }
  if (list.length > 2000) {
    return { ok: false, reason: "too many bookmarks (max 2000)" };
  }
  const bookmarks: BookmarkInput[] = [];
  for (let i = 0; i < list.length; i += 1) {
    const item = list[i] as BookmarkInput | undefined;
    if (!item || typeof item !== "object") {
      return { ok: false, reason: `bookmarks[${i}] must be an object` };
    }
    if (!item.url || typeof item.url !== "string" || !item.url.trim()) {
      return { ok: false, reason: `bookmarks[${i}].url is required` };
    }
    bookmarks.push(item);
  }
  return { ok: true, bookmarks };
}

export function newBatchId(source: BookmarkSource): string {
  return `${source}-${Date.now()}-${randomUUID().slice(0, 8)}`;
}

// Netscape bookmarks.html parser (Chrome / Edge / Firefox / Safari share the
// same format). Parses nested <DT><H3> folders and <DT><A> links. Only named
// attributes on <A> elements are read; anything else is preserved in sourceMeta.
export function parseNetscapeBookmarks(html: string): BookmarkInput[] {
  const out: BookmarkInput[] = [];
  if (typeof html !== "string" || html.length === 0) {
    return out;
  }

  const folderStack: string[] = [];
  const tokenRegex = /<H3[^>]*>([\s\S]*?)<\/H3>|<A\s+([^>]*)>([\s\S]*?)<\/A>|<\/DL>/gi;

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(html)) !== null) {
    const raw = match[0].toUpperCase();
    if (raw.startsWith("</DL>")) {
      folderStack.pop();
      continue;
    }

    if (raw.startsWith("<H3")) {
      const folderName = decodeEntities(match[1] ?? "").trim();
      folderStack.push(folderName || "未命名文件夹");
      continue;
    }

    const attrs = parseAttributes(match[2] ?? "");
    const bodyText = decodeEntities(match[3] ?? "").trim();
    const href = attrs.href?.trim();
    if (!href) continue;

    out.push({
      bookmark_id: attrs.id || undefined,
      url: href,
      bookmark_title: bodyText || attrs.title || "",
      folder_path: folderStack.join("/"),
      date_added: attrs.add_date,
      last_modified: attrs.last_modified,
      last_visited: attrs.last_visit || attrs.last_visit_date,
      page_title: bodyText || undefined,
      page_description: attrs.description,
      icon_url: attrs.icon_uri,
      icon_data: attrs.icon,
      tags: attrs.tags,
      is_private: attrs.private === "1" || attrs.private === "true"
    });
  }

  return out;
}

function parseAttributes(attrText: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_][a-zA-Z0-9_\-]*)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrText)) !== null) {
    const key = m[1]?.toLowerCase();
    if (!key) continue;
    attrs[key] = decodeEntities(m[2] ?? "");
  }
  return attrs;
}

function decodeEntities(input: string): string {
  return input
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}
