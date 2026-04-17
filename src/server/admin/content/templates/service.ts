import prisma from "@/server/infrastructure/db/prisma";
import type { Prisma } from "@prisma/client";

export async function listTemplates() {
  return prisma.defaultTemplate.findMany({
    orderBy: { publishedAt: "desc" }
  });
}

export async function getLatestTemplate() {
  return prisma.defaultTemplate.findFirst({
    orderBy: { publishedAt: "desc" }
  });
}

export interface PublishTemplateInput {
  version: string;
  content: Prisma.InputJsonValue;
  notes?: string;
  publishedBy?: string | null;
}

export async function publishTemplate(input: PublishTemplateInput) {
  return prisma.defaultTemplate.create({
    data: {
      version: input.version,
      content: input.content,
      notes: input.notes ?? null,
      publishedBy: input.publishedBy ?? null
    }
  });
}

export function validateTemplateJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    const value = JSON.parse(raw);
    if (value === null || typeof value !== "object") {
      return { ok: false, error: "template must be a JSON object" };
    }
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
