import prisma from "@/server/infrastructure/db/prisma";

export interface ListLinksParams {
  userId?: string;
  pageId?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export async function listContentLinks(params: ListLinksParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 30));
  const where = {
    ...(params.userId ? { userId: params.userId } : {}),
    ...(params.pageId ? { pageId: params.pageId } : {}),
    ...(params.keyword
      ? {
          OR: [
            { name: { contains: params.keyword, mode: "insensitive" as const } },
            { url: { contains: params.keyword, mode: "insensitive" as const } }
          ]
        }
      : {})
  };
  const [items, total] = await Promise.all([
    prisma.link.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        user: { select: { id: true, login: true, email: true } },
        page: { select: { id: true, name: true } },
        folder: { select: { id: true, name: true } }
      }
    }),
    prisma.link.count({ where })
  ]);
  return { items, total, page, pageSize };
}
