import { NextRequest } from "next/server";
import { ok, fail } from "@/server/shared/response";
import prisma from "@/server/infrastructure/db/prisma";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { cardId?: string };
  const cardId = body.cardId?.trim();

  if (!cardId) {
    return fail(2002, "cardId is required", 400);
  }

  try {
    await prisma.bendyCard.update({
      where: { id: cardId },
      data: { installNum: { increment: 1 } }
    });
  } catch {
    // Card not found in new table — ignore silently (may be a legacy card)
  }

  return ok({});
}
