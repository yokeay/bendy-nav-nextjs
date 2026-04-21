// Card domain types shared by service layer and API routes.
// Kept free of Prisma types so route handlers and UI code can import without circular refs.

export const CARD_HOSTS = ["iframe", "window", "inline"] as const;
export type CardHost = (typeof CARD_HOSTS)[number];

export const CARD_SIZES = ["1x1", "1x2", "2x2", "2x4"] as const;
export type CardSize = (typeof CARD_SIZES)[number];

export const CARD_STATUSES = [
  "draft",
  "submitted",
  "reviewing",
  "approved",
  "rejected",
  "deprecated"
] as const;
export type CardStatus = (typeof CARD_STATUSES)[number];

export const CARD_REVIEW_ACTIONS = [
  "approve",
  "reject",
  "request_changes",
  "deprecate"
] as const;
export type CardReviewAction = (typeof CARD_REVIEW_ACTIONS)[number];

export const CARD_SUBMISSION_ACTIONS = ["submit", "resubmit", ...CARD_REVIEW_ACTIONS] as const;
export type CardSubmissionAction = (typeof CARD_SUBMISSION_ACTIONS)[number];

export const INLINE_SOURCE_MAX_BYTES = 64 * 1024;
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
export const SEMVER_RE = /^\d+\.\d+\.\d+$/;

export interface CardSubmissionInput {
  slug: string;
  name: string;
  nameEn?: string | null;
  tips?: string;
  description?: string;
  icon?: string;
  coverUrl?: string | null;
  host: CardHost;
  entryUrl?: string;
  size?: CardSize;
  resizable?: boolean;
  permissions?: string[];
  sandbox?: string;
  contentSecurityPolicy?: string | null;
  inlineSource?: string | null;
  tags?: string[];
  version?: string;
  changelog?: string | null;
  authorName?: string | null;
  authorContact?: string | null;
  status?: "draft" | "submitted";
}

export interface ValidationError {
  ok: false;
  field: string;
  reason: string;
}

export interface ValidationOk<T> {
  ok: true;
  value: T;
}

export type ValidationResult<T> = ValidationOk<T> | ValidationError;

export interface CardDto {
  id: string;
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
  status: CardStatus;
  isFeatured: boolean;
  installNum: number;
  authorId: string | null;
  authorName: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CardSubmissionDto {
  id: string;
  cardId: string | null;
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
  status: CardStatus;
  rejectReason: string | null;
  action: CardSubmissionAction;
  reviewerId: string | null;
  reviewerNote: string | null;
  authorId: string;
  authorName: string | null;
  authorContact: string | null;
  scanBlockers: Array<{ code: string; message: string; excerpt?: string }>;
  scanWarnings: Array<{ code: string; message: string; excerpt?: string }>;
  createdAt: string;
  updatedAt: string;
  reviewedAt: string | null;
}

// Shape mirrored from legacy `/card/index` response — future migration target.
export interface LegacyCardCatalogItem {
  id: string;
  name: string;
  name_en: string;
  tips: string;
  src: string;
  url: string;
  window: string;
  version: string;
  install_num: number;
}

export function isCardHost(v: unknown): v is CardHost {
  return typeof v === "string" && (CARD_HOSTS as readonly string[]).includes(v);
}

export function isCardSize(v: unknown): v is CardSize {
  return typeof v === "string" && (CARD_SIZES as readonly string[]).includes(v);
}

export function isCardStatus(v: unknown): v is CardStatus {
  return typeof v === "string" && (CARD_STATUSES as readonly string[]).includes(v);
}

export function isCardReviewAction(v: unknown): v is CardReviewAction {
  return typeof v === "string" && (CARD_REVIEW_ACTIONS as readonly string[]).includes(v);
}

export function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function bumpSemverPatch(current: string): string {
  if (!SEMVER_RE.test(current)) {
    return "1.0.0";
  }
  const [maj, min, patch] = current.split(".").map((n) => Number(n));
  return `${maj}.${min}.${(patch ?? 0) + 1}`;
}

export function nextVersion(current: string | null | undefined, requested: string | null | undefined): string {
  const c = (current || "").trim();
  const r = (requested || "").trim();
  if (r && SEMVER_RE.test(r)) {
    if (!c) return r;
    // Only accept a strictly-greater requested version. Otherwise bump patch.
    const cmp = compareSemver(r, c);
    if (cmp > 0) return r;
  }
  return c ? bumpSemverPatch(c) : "1.0.0";
}

export function compareSemver(a: string, b: string): number {
  if (!SEMVER_RE.test(a) || !SEMVER_RE.test(b)) return 0;
  const [a1, a2, a3] = a.split(".").map((n) => Number(n));
  const [b1, b2, b3] = b.split(".").map((n) => Number(n));
  if (a1 !== b1) return (a1 ?? 0) - (b1 ?? 0);
  if (a2 !== b2) return (a2 ?? 0) - (b2 ?? 0);
  return (a3 ?? 0) - (b3 ?? 0);
}
