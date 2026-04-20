import { describe, expect, it } from "vitest";
import {
  buildBookmarkMeta,
  mapBookmarkToDraft,
  mapBookmarkToHomeLink,
  mapBookmarkToPrismaLink,
  parseNetscapeBookmarks,
  pickBookmarkName,
  validateBookmarkBatch,
  type BookmarkInput
} from "@/server/bookmarks/import-service";

const sample: BookmarkInput = {
  bookmark_id: "bm-1",
  url: "https://example.com",
  bookmark_title: "我的书签",
  folder_path: "Bookmarks bar/前端",
  date_added: "1714000000000",
  page_title: "Example Domain",
  page_description: "This domain is for use in illustrative examples.",
  generated_title: "Example - Illustrative",
  generated_description: "Illustrative domain summary.",
  tags: "web,example"
};

describe("bookmarks import-service", () => {
  it("picks bookmark_title first", () => {
    expect(pickBookmarkName(sample)).toBe("我的书签");
  });

  it("falls back through generated/page title", () => {
    expect(pickBookmarkName({ ...sample, bookmark_title: "" })).toBe("Example - Illustrative");
    expect(pickBookmarkName({ ...sample, bookmark_title: "", generated_title: "" })).toBe(
      "Example Domain"
    );
  });

  it("captures the full meta payload", () => {
    const meta = buildBookmarkMeta(sample);
    expect(meta.folder_path).toBe("Bookmarks bar/前端");
    expect(meta.tags).toBe("web,example");
    expect(meta.bookmark_id).toBe("bm-1");
    expect(meta.generated_description).toBe("Illustrative domain summary.");
  });

  it("maps to a Prisma link draft", () => {
    const draft = mapBookmarkToPrismaLink(sample, "u_123", 7);
    expect(draft).toMatchObject({
      userId: "u_123",
      name: "我的书签",
      url: "https://example.com",
      sort: 7
    });
  });

  it("maps to a legacy HomeLink JSON entry", () => {
    let seq = 0;
    const link = mapBookmarkToHomeLink(sample, 3, () => `id-${++seq}`);
    expect(link.id).toBe("id-1");
    expect(link.type).toBe("icon");
    expect(link.form).toBe("link");
    expect(link.size).toBe("1x1");
    expect(link.sort).toBe(3);
    expect(link.url).toBe("https://example.com");
    expect(link.name).toBe("我的书签");
  });

  it("rejects non-array input", () => {
    const res = validateBookmarkBatch(null);
    expect(res.ok).toBe(false);
  });

  it("rejects empty batches", () => {
    const res = validateBookmarkBatch([]);
    expect(res.ok).toBe(false);
  });

  it("rejects items without url", () => {
    const res = validateBookmarkBatch([{ bookmark_title: "no url" }]);
    expect(res.ok).toBe(false);
  });

  it("rejects batches larger than 2000", () => {
    const many = Array.from({ length: 2001 }, () => ({ url: "https://a" }));
    const res = validateBookmarkBatch(many);
    expect(res.ok).toBe(false);
  });

  it("accepts a valid batch", () => {
    const res = validateBookmarkBatch([sample]);
    expect(res.ok).toBe(true);
    if (res.ok === true) {
      expect(res.bookmarks).toHaveLength(1);
    }
  });

  it("maps to a unified Bookmark draft", () => {
    const draft = mapBookmarkToDraft(sample, {
      userId: "u_123",
      source: "extension",
      batchId: "batch-1",
      sort: 11
    });
    expect(draft.userId).toBe("u_123");
    expect(draft.url).toBe("https://example.com");
    expect(draft.title).toBe("我的书签");
    expect(draft.folderPath).toBe("Bookmarks bar/前端");
    expect(draft.tags).toBe("web,example");
    expect(draft.source).toBe("extension");
    expect(draft.sourceBatchId).toBe("batch-1");
    expect(draft.sort).toBe(11);
    expect(draft.addDate).toBeInstanceOf(Date);
  });

  it("parses a Netscape bookmarks.html document", () => {
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1714000000">技术</H3>
    <DL><p>
        <DT><A HREF="https://example.com" ADD_DATE="1714000000" ICON_URI="https://example.com/favicon.ico">Example</A>
        <DT><A HREF="https://news.example.com" ADD_DATE="1714000100" TAGS="news,daily" PRIVATE="1">News</A>
    </DL><p>
    <DT><A HREF="https://top-level.example.com">Top level</A>
</DL><p>`;
    const parsed = parseNetscapeBookmarks(html);
    expect(parsed.length).toBe(3);
    const nested = parsed[0];
    expect(nested?.url).toBe("https://example.com");
    expect(nested?.folder_path).toBe("技术");
    expect(nested?.icon_url).toBe("https://example.com/favicon.ico");
    const priv = parsed[1];
    expect(priv?.tags).toBe("news,daily");
    expect(priv?.is_private).toBe(true);
    expect(parsed[2]?.folder_path).toBe("");
  });
});
