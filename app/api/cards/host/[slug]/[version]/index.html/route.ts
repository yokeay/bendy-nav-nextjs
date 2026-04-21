import type { NextRequest } from "next/server";
import prisma from "@/server/infrastructure/db/prisma";
import { packInlineSource, DEFAULT_CARD_CSP } from "@/server/cards/packaging";

// Renders the packed HTML for an inline card. URL is pinned to a specific
// slug+version so installed cards keep rendering their approved build even
// after a newer version is published.
//
// Route: /api/cards/host/<slug>/<version>/index.html

interface Context {
  params: Promise<{ slug: string; version: string }>;
}

export async function GET(_req: NextRequest, context: Context) {
  const { slug, version } = await context.params;
  if (!slug || !version) {
    return new Response("Not Found", { status: 404 });
  }

  const card = await prisma.bendyCard.findUnique({ where: { slug } });
  if (!card || card.deletedAt || card.status !== "approved") {
    return new Response("Not Found", { status: 404 });
  }
  if (card.host !== "inline") {
    return new Response("Not Found", { status: 404 });
  }
  if (card.version !== version) {
    // Stale URL. The client is pinned to a specific version that is no longer
    // the current approved build — surface 404 so the host iframe shows an
    // obvious broken state rather than silently upgrading.
    return new Response("Version mismatch", { status: 404 });
  }

  const body = packInlineSource(card.inlineSource ?? "", {
    title: card.name,
    csp: card.contentSecurityPolicy
  });

  const csp = (card.contentSecurityPolicy ?? "").trim() || DEFAULT_CARD_CSP;

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": csp,
      "x-frame-options": "SAMEORIGIN",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      // Immutable for a given slug+version tuple; a new version gets a new URL.
      "cache-control": "public, max-age=300, must-revalidate"
    }
  });
}
