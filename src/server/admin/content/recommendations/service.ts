import prisma from "@/server/infrastructure/db/prisma";
import type { Prisma } from "@prisma/client";

export interface ListRecommendationsParams {
  keyword?: string;
  onlyRecommended?: boolean;
  page?: number;
  pageSize?: number;
}

export async function listRecommendations(params: ListRecommendationsParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 30));
  const where: Prisma.BookmarkWhereInput = {
    deletedAt: null,
    status: "active",
    ...(params.onlyRecommended ? { isRecommended: true } : {}),
    ...(params.keyword
      ? {
          OR: [
            { title: { contains: params.keyword, mode: "insensitive" } },
            { url: { contains: params.keyword, mode: "insensitive" } },
            { recommendTitle: { contains: params.keyword, mode: "insensitive" } }
          ]
        }
      : {})
  };
  const [items, total] = await Promise.all([
    prisma.bookmark.findMany({
      where,
      orderBy: [
        { isRecommended: "desc" },
        { recommendSort: "desc" },
        { updatedAt: "desc" }
      ],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.bookmark.count({ where })
  ]);
  return { items, total, page, pageSize };
}

export interface UpdateRecommendationPayload {
  bookmarkId: string;
  actorId: string | null;
  isRecommended?: boolean;
  recommendTitle?: string | null;
  recommendDesc?: string | null;
  recommendSort?: number;
  isPublic?: boolean;
}

export async function updateRecommendation(payload: UpdateRecommendationPayload) {
  const data: Prisma.BookmarkUpdateInput = {};
  if (typeof payload.isRecommended === "boolean") {
    data.isRecommended = payload.isRecommended;
    data.recommendedAt = payload.isRecommended ? new Date() : null;
    data.recommendedBy = payload.isRecommended ? payload.actorId ?? null : null;
    if (payload.isRecommended) {
      data.isPublic = true;
    }
  }
  if (payload.recommendTitle !== undefined) {
    data.recommendTitle = payload.recommendTitle?.trim() || null;
  }
  if (payload.recommendDesc !== undefined) {
    data.recommendDesc = payload.recommendDesc?.trim() || null;
  }
  if (typeof payload.recommendSort === "number") {
    data.recommendSort = payload.recommendSort;
  }
  if (typeof payload.isPublic === "boolean") {
    data.isPublic = payload.isPublic;
  }
  return prisma.bookmark.update({
    where: { id: payload.bookmarkId },
    data
  });
}

export interface PublicRecommendedItem {
  id: string;
  name: string;
  url: string;
  tips: string;
  src: string;
  bgColor: string | null;
  tags: string | null;
  app: number;
}

export async function listPublicRecommendedBookmarks(limit = 36): Promise<PublicRecommendedItem[]> {
  const cap = Math.min(200, Math.max(1, limit));
  const items = await prisma.bookmark.findMany({
    where: {
      isRecommended: true,
      isPublic: true,
      deletedAt: null,
      status: "active"
    },
    orderBy: [
      { recommendSort: "desc" },
      { recommendedAt: "desc" },
      { createdAt: "desc" }
    ],
    take: cap
  });
  return items.map((item) => ({
    id: item.id,
    name: (item.recommendTitle || item.title || item.url || "未命名").slice(0, 80),
    url: item.url,
    tips: (item.recommendDesc || item.generatedDescription || item.pageDescription || "").slice(0, 200),
    src: item.iconUrl || "",
    bgColor: null,
    tags: item.tags,
    app: 0
  }));
}
