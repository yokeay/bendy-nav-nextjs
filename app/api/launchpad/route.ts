import { type NextRequest } from "next/server";
import prisma from "@/server/infrastructure/db/prisma";
import { readSession } from "@/server/auth/middleware";
import { ok, fail } from "@/server/shared/response";
import { ERROR_CODES } from "@/server/shared/error-codes";

const PAGE_SIZE = 30;

export async function GET(req: NextRequest) {
  const session = await readSession();
  if (!session) {
    return fail(ERROR_CODES.UNAUTHORIZED, "unauthorized", 401);
  }

  const { searchParams } = req.nextUrl;
  const query = searchParams.get("q")?.trim() ?? "";
  const categoryId = searchParams.get("categoryId") ?? "";
  const source = searchParams.get("source") ?? "all"; // all | links | bookmarks
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? PAGE_SIZE)));

  const skip = (page - 1) * pageSize;

  const whereClause: object = {
    userId: session.sub,
    ...(query && {
      OR: [
        { name: { contains: query, mode: "insensitive" as const } },
        { title: { contains: query, mode: "insensitive" as const } }
      ]
    }),
    ...(categoryId && {
      categoryId: categoryId === "uncategorized" ? null : categoryId
    })
  };

  const [links, bookmarks, totalLinks, totalBookmarks, categories] = await Promise.all([
    source === "bookmarks" ? Promise.resolve([]) : prisma.link.findMany({
      where: whereClause,
      select: {
        id: true, name: true, url: true, icon: true, bgColor: true,
        sort: true, categoryId: true, size: true, app: true
      },
      orderBy: [{ sort: "asc" }, { createdAt: "desc" }],
      take: pageSize,
      skip: source === "all" ? 0 : skip
    }),
    source === "links" ? Promise.resolve([]) : prisma.bookmark.findMany({
      where: { userId: session.sub, deletedAt: null, status: "active", ...(query && { title: { contains: query, mode: "insensitive" as const } }), ...(categoryId && { categoryId: categoryId === "uncategorized" ? null : categoryId }) },
      select: {
        id: true, title: true, url: true, iconUrl: true, tags: true,
        sort: true, categoryId: true, createdAt: true
      },
      orderBy: [{ sort: "asc" }, { createdAt: "desc" }],
      take: pageSize,
      skip: source === "all" ? 0 : skip
    }),
    source === "bookmarks" ? Promise.resolve(0) : prisma.link.count({ where: whereClause }),
    source === "links" ? Promise.resolve(0) : prisma.bookmark.count({ where: { userId: session.sub, deletedAt: null, status: "active", ...(query && { title: { contains: query, mode: "insensitive" as const } }), ...(categoryId && { categoryId: categoryId === "uncategorized" ? null : categoryId }) } }),
    prisma.category.findMany({
      where: { userId: session.sub },
      select: { id: true, name: true, icon: true, color: true, sort: true },
      orderBy: [{ sort: "asc" }, { createdAt: "asc" }]
    })
  ]);

  const total = source === "links" ? totalLinks : source === "bookmarks" ? totalBookmarks : totalLinks + totalBookmarks;
  const totalPages = Math.ceil(total / pageSize);

  return ok({
    query,
    categoryId,
    sources: {
      links: links.map(l => ({ id: l.id, name: l.name, url: l.url, icon: l.icon, bgColor: l.bgColor, sort: l.sort, categoryId: l.categoryId, size: l.size, app: l.app, _type: "link" })),
      bookmarks: bookmarks.map(b => ({ id: b.id, name: b.title, url: b.url, icon: b.iconUrl, tags: b.tags, sort: b.sort, categoryId: b.categoryId, createdAt: b.createdAt, _type: "bookmark" }))
    },
    categories,
    pagination: { page, pageSize, total, totalPages, hasMore: page < totalPages }
  });
}
