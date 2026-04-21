import prisma from "@/server/infrastructure/db/prisma";
import type { Prisma, BendyCard, BendyCardSubmission } from "@prisma/client";
import {
  CARD_HOSTS,
  CARD_SIZES,
  INLINE_SOURCE_MAX_BYTES,
  SEMVER_RE,
  SLUG_RE,
  toStringArray,
  nextVersion,
  type CardDto,
  type CardHost,
  type CardReviewAction,
  type CardStatus,
  type CardSubmissionAction,
  type CardSubmissionDto,
  type CardSubmissionInput,
  type ValidationResult
} from "./types";

type NormalizedSubmission = {
  slug: string;
  name: string;
  nameEn: string | null;
  tips: string;
  description: string;
  icon: string;
  coverUrl: string | null;
  host: CardHost;
  entryUrl: string;
  size: string;
  resizable: boolean;
  permissions: string[];
  sandbox: string;
  contentSecurityPolicy: string | null;
  inlineSource: string | null;
  tags: string[];
  version: string;
  changelog: string | null;
  authorName: string | null;
  authorContact: string | null;
  status: "draft" | "submitted";
};

function normalize(input: CardSubmissionInput): ValidationResult<NormalizedSubmission> {
  if (typeof input.slug !== "string" || !SLUG_RE.test(input.slug)) {
    return { ok: false, field: "slug", reason: "slug 必须是 2-40 位小写字母/数字/短横线，且以字母或数字开头" };
  }
  if (typeof input.name !== "string" || input.name.trim().length === 0) {
    return { ok: false, field: "name", reason: "name 不能为空" };
  }
  if (input.name.trim().length > 40) {
    return { ok: false, field: "name", reason: "name 最长 40 字符" };
  }
  if (!(CARD_HOSTS as readonly string[]).includes(input.host)) {
    return { ok: false, field: "host", reason: "host 必须是 iframe/window/inline" };
  }

  const size = input.size && (CARD_SIZES as readonly string[]).includes(input.size) ? input.size : "2x4";
  const host = input.host;
  const entryUrl = (input.entryUrl ?? "").trim();
  const inlineSource = (input.inlineSource ?? "").trim();

  if (host === "iframe" || host === "window") {
    if (!entryUrl) {
      return { ok: false, field: "entryUrl", reason: "iframe/window 宿主必须提供 entryUrl" };
    }
    if (!/^https:\/\//i.test(entryUrl)) {
      return { ok: false, field: "entryUrl", reason: "entryUrl 必须是 https 开头" };
    }
    try {
      // Validate parseability early so we don't persist malformed URLs.
      void new URL(entryUrl);
    } catch {
      return { ok: false, field: "entryUrl", reason: "entryUrl 格式不合法" };
    }
  }
  if (host === "inline") {
    if (!inlineSource) {
      return { ok: false, field: "inlineSource", reason: "inline 宿主必须提供 HTML/JS 源码" };
    }
    if (Buffer.byteLength(inlineSource, "utf8") > INLINE_SOURCE_MAX_BYTES) {
      return { ok: false, field: "inlineSource", reason: "inline 源码超过 64KB 上限" };
    }
  }

  const version = typeof input.version === "string" && SEMVER_RE.test(input.version) ? input.version : "1.0.0";
  const status: "draft" | "submitted" = input.status === "draft" ? "draft" : "submitted";

  return {
    ok: true,
    value: {
      slug: input.slug,
      name: input.name.trim(),
      nameEn: input.nameEn?.trim() || null,
      tips: (input.tips ?? "").trim().slice(0, 200),
      description: (input.description ?? "").trim().slice(0, 4000),
      icon: (input.icon ?? "").trim(),
      coverUrl: input.coverUrl?.trim() || null,
      host,
      entryUrl,
      size,
      resizable: Boolean(input.resizable),
      permissions: toStringArray(input.permissions).slice(0, 20),
      sandbox: (input.sandbox ?? "allow-scripts allow-forms").trim() || "allow-scripts allow-forms",
      contentSecurityPolicy: input.contentSecurityPolicy?.trim() || null,
      inlineSource: host === "inline" ? inlineSource : null,
      tags: toStringArray(input.tags).slice(0, 20),
      version,
      changelog: input.changelog?.trim() || null,
      authorName: input.authorName?.trim() || null,
      authorContact: input.authorContact?.trim() || null,
      status
    }
  };
}

export interface CreateSubmissionResult {
  submission: CardSubmissionDto;
  card: CardDto | null;
  autoApproved: boolean;
}

export interface AuthorContext {
  authorId: string;
  role: "user" | "admin" | "superadmin";
}

export async function createSubmission(
  ctx: AuthorContext,
  raw: CardSubmissionInput
): Promise<{ ok: true; result: CreateSubmissionResult } | { ok: false; field: string; reason: string; conflict?: boolean }> {
  const normalized = normalize(raw);
  if (normalized.ok !== true) {
    return { ok: false, field: normalized.field, reason: normalized.reason };
  }
  const data = normalized.value;

  const existingCard = await prisma.bendyCard.findUnique({ where: { slug: data.slug } });
  if (existingCard && existingCard.authorId && existingCard.authorId !== ctx.authorId && ctx.role === "user") {
    return {
      ok: false,
      field: "slug",
      reason: `slug 已被其他作者占用：${data.slug}`,
      conflict: true
    };
  }

  const isAdmin = ctx.role === "admin" || ctx.role === "superadmin";
  const shouldAutoApprove = isAdmin && data.status === "submitted";

  const created = await prisma.bendyCardSubmission.create({
    data: {
      cardId: existingCard?.id ?? null,
      slug: data.slug,
      name: data.name,
      nameEn: data.nameEn,
      tips: data.tips,
      description: data.description,
      icon: data.icon,
      coverUrl: data.coverUrl,
      host: data.host,
      entryUrl: data.entryUrl,
      size: data.size,
      resizable: data.resizable,
      permissions: data.permissions,
      sandbox: data.sandbox,
      contentSecurityPolicy: data.contentSecurityPolicy,
      inlineSource: data.inlineSource,
      tags: data.tags,
      version: data.version,
      changelog: data.changelog,
      status: shouldAutoApprove ? "approved" : data.status,
      action: shouldAutoApprove ? "approve" : "submit",
      reviewerId: shouldAutoApprove ? ctx.authorId : null,
      reviewerNote: shouldAutoApprove ? "auto-approved: author is admin" : null,
      authorId: ctx.authorId,
      authorName: data.authorName,
      authorContact: data.authorContact,
      reviewedAt: shouldAutoApprove ? new Date() : null
    }
  });

  let publishedCard: BendyCard | null = null;
  if (shouldAutoApprove) {
    publishedCard = await publishCardFromSubmission(created, existingCard);
    await prisma.bendyCardSubmission.update({
      where: { id: created.id },
      data: { cardId: publishedCard.id }
    });
  }

  const refreshed = await prisma.bendyCardSubmission.findUniqueOrThrow({ where: { id: created.id } });
  return {
    ok: true,
    result: {
      submission: submissionToDto(refreshed),
      card: publishedCard ? cardToDto(publishedCard) : null,
      autoApproved: shouldAutoApprove
    }
  };
}

export async function updateSubmission(
  ctx: AuthorContext,
  submissionId: string,
  raw: CardSubmissionInput
): Promise<
  | { ok: true; result: CreateSubmissionResult }
  | { ok: false; field: string; reason: string; notFound?: boolean; forbidden?: boolean; conflict?: boolean }
> {
  const existing = await prisma.bendyCardSubmission.findUnique({ where: { id: submissionId } });
  if (!existing) {
    return { ok: false, field: "id", reason: "提交不存在", notFound: true };
  }
  const isAdmin = ctx.role === "admin" || ctx.role === "superadmin";
  if (existing.authorId !== ctx.authorId && !isAdmin) {
    return { ok: false, field: "id", reason: "无权修改该提交", forbidden: true };
  }
  if (!["draft", "submitted", "reviewing", "rejected"].includes(existing.status)) {
    return { ok: false, field: "status", reason: "该提交已定稿，无法再编辑" };
  }

  const normalized = normalize(raw);
  if (normalized.ok !== true) {
    return { ok: false, field: normalized.field, reason: normalized.reason };
  }
  const data = normalized.value;

  if (data.slug !== existing.slug) {
    const slugClash = await prisma.bendyCard.findUnique({ where: { slug: data.slug } });
    if (slugClash && slugClash.authorId && slugClash.authorId !== ctx.authorId && ctx.role === "user") {
      return { ok: false, field: "slug", reason: `slug 已被占用：${data.slug}`, conflict: true };
    }
  }

  const shouldAutoApprove = isAdmin && data.status === "submitted";

  const updated = await prisma.bendyCardSubmission.update({
    where: { id: submissionId },
    data: {
      slug: data.slug,
      name: data.name,
      nameEn: data.nameEn,
      tips: data.tips,
      description: data.description,
      icon: data.icon,
      coverUrl: data.coverUrl,
      host: data.host,
      entryUrl: data.entryUrl,
      size: data.size,
      resizable: data.resizable,
      permissions: data.permissions,
      sandbox: data.sandbox,
      contentSecurityPolicy: data.contentSecurityPolicy,
      inlineSource: data.inlineSource,
      tags: data.tags,
      version: data.version,
      changelog: data.changelog,
      status: shouldAutoApprove ? "approved" : data.status,
      action: shouldAutoApprove ? "approve" : existing.status === "rejected" ? "resubmit" : "submit",
      reviewerId: shouldAutoApprove ? ctx.authorId : null,
      reviewerNote: shouldAutoApprove ? "auto-approved: author is admin" : null,
      authorName: data.authorName,
      authorContact: data.authorContact,
      reviewedAt: shouldAutoApprove ? new Date() : null,
      rejectReason: null
    }
  });

  let publishedCard: BendyCard | null = null;
  if (shouldAutoApprove) {
    const targetCard = updated.cardId
      ? await prisma.bendyCard.findUnique({ where: { id: updated.cardId } })
      : await prisma.bendyCard.findUnique({ where: { slug: updated.slug } });
    publishedCard = await publishCardFromSubmission(updated, targetCard);
    if (!updated.cardId) {
      await prisma.bendyCardSubmission.update({
        where: { id: submissionId },
        data: { cardId: publishedCard.id }
      });
    }
  }

  const refreshed = await prisma.bendyCardSubmission.findUniqueOrThrow({ where: { id: submissionId } });
  return {
    ok: true,
    result: {
      submission: submissionToDto(refreshed),
      card: publishedCard ? cardToDto(publishedCard) : null,
      autoApproved: shouldAutoApprove
    }
  };
}

export interface ReviewActionInput {
  action: CardReviewAction;
  note?: string | null;
  rejectReason?: string | null;
  version?: string | null;
}

export async function reviewSubmission(
  reviewerId: string,
  submissionId: string,
  input: ReviewActionInput
): Promise<
  | { ok: true; result: CreateSubmissionResult }
  | { ok: false; field: string; reason: string; notFound?: boolean }
> {
  const existing = await prisma.bendyCardSubmission.findUnique({ where: { id: submissionId } });
  if (!existing) {
    return { ok: false, field: "id", reason: "提交不存在", notFound: true };
  }
  if (input.action === "approve" && existing.status !== "submitted" && existing.status !== "reviewing") {
    return { ok: false, field: "status", reason: "仅 submitted/reviewing 状态可 approve" };
  }
  if (input.action === "reject" && existing.status !== "submitted" && existing.status !== "reviewing") {
    return { ok: false, field: "status", reason: "仅 submitted/reviewing 状态可 reject" };
  }
  if (input.action === "reject" && !input.rejectReason?.trim()) {
    return { ok: false, field: "rejectReason", reason: "reject 必须提供原因" };
  }
  if (input.action === "request_changes" && !input.note?.trim()) {
    return { ok: false, field: "note", reason: "request_changes 必须提供备注" };
  }

  const now = new Date();
  let publishedCard: BendyCard | null = null;

  if (input.action === "approve") {
    const targetCard = existing.cardId
      ? await prisma.bendyCard.findUnique({ where: { id: existing.cardId } })
      : await prisma.bendyCard.findUnique({ where: { slug: existing.slug } });
    publishedCard = await publishCardFromSubmission(existing, targetCard, input.version ?? null);
    await prisma.bendyCardSubmission.update({
      where: { id: submissionId },
      data: {
        status: "approved",
        action: "approve",
        reviewerId,
        reviewerNote: input.note?.trim() || null,
        reviewedAt: now,
        cardId: publishedCard.id,
        rejectReason: null
      }
    });
  } else if (input.action === "reject") {
    await prisma.bendyCardSubmission.update({
      where: { id: submissionId },
      data: {
        status: "rejected",
        action: "reject",
        reviewerId,
        reviewerNote: input.note?.trim() || null,
        rejectReason: input.rejectReason?.trim() || null,
        reviewedAt: now
      }
    });
  } else if (input.action === "request_changes") {
    await prisma.bendyCardSubmission.update({
      where: { id: submissionId },
      data: {
        status: "reviewing",
        action: "request_changes",
        reviewerId,
        reviewerNote: input.note?.trim() || null,
        reviewedAt: now
      }
    });
  } else if (input.action === "deprecate") {
    if (existing.cardId) {
      const card = await prisma.bendyCard.update({
        where: { id: existing.cardId },
        data: { status: "deprecated" }
      });
      publishedCard = card;
    }
    await prisma.bendyCardSubmission.update({
      where: { id: submissionId },
      data: {
        status: "deprecated",
        action: "deprecate",
        reviewerId,
        reviewerNote: input.note?.trim() || null,
        reviewedAt: now
      }
    });
  }

  const refreshed = await prisma.bendyCardSubmission.findUniqueOrThrow({ where: { id: submissionId } });
  return {
    ok: true,
    result: {
      submission: submissionToDto(refreshed),
      card: publishedCard ? cardToDto(publishedCard) : null,
      autoApproved: false
    }
  };
}

async function publishCardFromSubmission(
  submission: BendyCardSubmission,
  existingCard: BendyCard | null,
  requestedVersion: string | null = null
): Promise<BendyCard> {
  const version = nextVersion(existingCard?.version ?? null, requestedVersion ?? submission.version);
  const now = new Date();
  const payload: Prisma.BendyCardUncheckedCreateInput = {
    slug: submission.slug,
    name: submission.name,
    nameEn: submission.nameEn,
    tips: submission.tips,
    description: submission.description,
    icon: submission.icon,
    coverUrl: submission.coverUrl,
    host: submission.host,
    entryUrl: submission.entryUrl,
    size: submission.size,
    resizable: submission.resizable,
    permissions: submission.permissions ?? [],
    sandbox: submission.sandbox,
    contentSecurityPolicy: submission.contentSecurityPolicy,
    schemaVersion: submission.schemaVersion,
    inlineSource: submission.inlineSource,
    tags: submission.tags ?? [],
    version,
    changelog: submission.changelog,
    status: "approved",
    authorId: submission.authorId,
    authorName: submission.authorName,
    authorContact: submission.authorContact,
    publishedAt: now
  };

  if (existingCard) {
    return prisma.bendyCard.update({
      where: { id: existingCard.id },
      data: {
        ...payload,
        // Never overwrite installNum / isFeatured on republish.
        installNum: undefined,
        isFeatured: undefined
      }
    });
  }
  return prisma.bendyCard.create({ data: payload });
}

export interface ListSubmissionsParams {
  authorId?: string;
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export async function listSubmissions(params: ListSubmissionsParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 30));
  const where: Prisma.BendyCardSubmissionWhereInput = {};
  if (params.authorId) where.authorId = params.authorId;
  if (params.status) where.status = params.status;
  if (params.keyword) {
    where.OR = [
      { name: { contains: params.keyword, mode: "insensitive" } },
      { slug: { contains: params.keyword, mode: "insensitive" } },
      { authorName: { contains: params.keyword, mode: "insensitive" } }
    ];
  }
  const [items, total] = await Promise.all([
    prisma.bendyCardSubmission.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.bendyCardSubmission.count({ where })
  ]);
  return {
    items: items.map(submissionToDto),
    total,
    page,
    pageSize
  };
}

export async function getSubmission(submissionId: string): Promise<CardSubmissionDto | null> {
  const row = await prisma.bendyCardSubmission.findUnique({ where: { id: submissionId } });
  return row ? submissionToDto(row) : null;
}

export function submissionToDto(row: BendyCardSubmission): CardSubmissionDto {
  return {
    id: row.id,
    cardId: row.cardId,
    slug: row.slug,
    name: row.name,
    nameEn: row.nameEn,
    tips: row.tips,
    description: row.description,
    icon: row.icon,
    coverUrl: row.coverUrl,
    host: (row.host as CardHost) ?? "iframe",
    entryUrl: row.entryUrl,
    size: row.size,
    resizable: row.resizable,
    permissions: toStringArray(row.permissions),
    sandbox: row.sandbox,
    contentSecurityPolicy: row.contentSecurityPolicy,
    inlineSource: row.inlineSource,
    tags: toStringArray(row.tags),
    version: row.version,
    changelog: row.changelog,
    status: (row.status as CardStatus) ?? "submitted",
    rejectReason: row.rejectReason,
    action: (row.action as CardSubmissionAction) ?? "submit",
    reviewerId: row.reviewerId,
    reviewerNote: row.reviewerNote,
    authorId: row.authorId,
    authorName: row.authorName,
    authorContact: row.authorContact,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null
  };
}

export function cardToDto(row: BendyCard): CardDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    nameEn: row.nameEn,
    tips: row.tips,
    description: row.description,
    icon: row.icon,
    coverUrl: row.coverUrl,
    host: (row.host as CardHost) ?? "iframe",
    entryUrl: row.entryUrl,
    size: row.size,
    resizable: row.resizable,
    permissions: toStringArray(row.permissions),
    sandbox: row.sandbox,
    contentSecurityPolicy: row.contentSecurityPolicy,
    inlineSource: row.inlineSource,
    tags: toStringArray(row.tags),
    version: row.version,
    changelog: row.changelog,
    status: (row.status as CardStatus) ?? "approved",
    isFeatured: row.isFeatured,
    installNum: row.installNum,
    authorId: row.authorId,
    authorName: row.authorName,
    publishedAt: row.publishedAt ? row.publishedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}
