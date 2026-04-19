import type { Prisma } from "@prisma/client";

export type BookmarkInput = {
  bookmark_id?: string;
  url?: string;
  bookmark_title?: string;
  folder_path?: string;
  date_added?: string | number;
  page_title?: string;
  page_description?: string;
  page_text?: string;
  generated_title?: string;
  generated_description?: string;
  crawl_error?: string;
  tags?: string;
};

export type PrismaLinkDraft = {
  userId: string;
  name: string;
  url: string;
  sort: number;
  meta: Prisma.InputJsonValue;
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

export function mapBookmarkToPrismaLink(
  input: BookmarkInput,
  userId: string,
  sort: number
): PrismaLinkDraft {
  return {
    userId,
    name: pickBookmarkName(input),
    url: String(input.url ?? "").trim(),
    sort,
    meta: buildBookmarkMeta(input) as Prisma.InputJsonValue
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
    src: "/favicon.png",
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
  if (list.length > 1000) {
    return { ok: false, reason: "too many bookmarks (max 1000)" };
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
