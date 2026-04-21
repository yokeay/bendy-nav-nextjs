import prisma from "@/server/infrastructure/db/prisma";
import type { Prisma, BendyCard } from "@prisma/client";
import { cardToDto } from "./submission-service";
import type { CardDto, LegacyCardCatalogItem } from "./types";

export interface ListPublicCardsParams {
  limit?: number;
  featured?: boolean;
}

export async function listPublicCards(params: ListPublicCardsParams = {}): Promise<CardDto[]> {
  const limit = Math.min(200, Math.max(1, params.limit ?? 100));
  const where: Prisma.BendyCardWhereInput = {
    status: "approved",
    deletedAt: null
  };
  if (params.featured) where.isFeatured = true;

  const rows = await prisma.bendyCard.findMany({
    where,
    orderBy: [
      { isFeatured: "desc" },
      { installNum: "desc" },
      { publishedAt: "desc" }
    ],
    take: limit
  });
  return rows.map(cardToDto);
}

export interface ListAdminCardsParams {
  keyword?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export async function listAdminCards(params: ListAdminCardsParams = {}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 30));
  const where: Prisma.BendyCardWhereInput = {
    deletedAt: null
  };
  if (params.status) where.status = params.status;
  if (params.keyword) {
    where.OR = [
      { name: { contains: params.keyword, mode: "insensitive" } },
      { slug: { contains: params.keyword, mode: "insensitive" } },
      { authorName: { contains: params.keyword, mode: "insensitive" } }
    ];
  }
  const [rows, total] = await Promise.all([
    prisma.bendyCard.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.bendyCard.count({ where })
  ]);
  return {
    items: rows.map(cardToDto),
    total,
    page,
    pageSize
  };
}

export async function getCardBySlug(slug: string): Promise<CardDto | null> {
  const row = await prisma.bendyCard.findUnique({ where: { slug } });
  return row ? cardToDto(row) : null;
}

// Project a BendyCard into the legacy `/card/index` item shape. Kept here so the
// future C-side switch (plan.md Phase 6 step 7) needs zero frontend changes.
export function toLegacyCatalogItem(card: CardDto): LegacyCardCatalogItem {
  return {
    id: card.id,
    name: card.name,
    name_en: card.nameEn ?? "",
    tips: card.tips,
    src: card.icon,
    url: card.entryUrl,
    window: card.host === "window" ? card.entryUrl : card.host === "inline" ? "" : card.entryUrl,
    version: card.version,
    install_num: card.installNum
  };
}

export function cardRowToDto(row: BendyCard): CardDto {
  return cardToDto(row);
}
