// Inline card packaging.
//
// On approve, an inline submission's raw HTML/JS (up to 64KB) is wrapped into a
// standalone HTML document with a default CSP meta tag and stored back on the
// BendyCard row as-is. A dynamic route (app/api/cards/host) serves the packed
// HTML with matching CSP + X-Frame-Options headers so it can be iframed from
// the home grid the same way external iframe cards are.
//
// Design decisions:
//  - We don't write files to disk. inline cards live in the DB as `inlineSource`
//    and are materialized by the host route on each request. This keeps the
//    deployment story identical across VPS / single-container / serverless.
//  - entryUrl for inline cards is `/api/cards/host/<slug>/<version>/index.html`.
//    Version is pinned so an installed card keeps rendering its approved build
//    even after the author pushes a new version.
//  - The packed HTML always carries a CSP that forbids remote scripts. The
//    route handler additionally sets CSP and X-Frame-Options as HTTP headers.

export const DEFAULT_CARD_CSP = [
  "default-src 'self'",
  // allow-inline required because user source is embedded directly
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src * data: blob:",
  "font-src * data:",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'"
].join("; ");

interface PackInlineOptions {
  title: string;
  csp?: string | null;
}

export function packInlineSource(source: string, opts: PackInlineOptions): string {
  const csp = (opts.csp ?? "").trim() || DEFAULT_CARD_CSP;
  const title = escapeHtml(opts.title);
  const raw = source ?? "";

  if (/^\s*<!doctype\s+html/i.test(raw) || /^\s*<html[\s>]/i.test(raw)) {
    return injectCspIntoDocument(raw, csp);
  }

  return [
    "<!doctype html>",
    "<html lang=\"zh-CN\">",
    "<head>",
    "<meta charset=\"utf-8\">",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    `<meta http-equiv=\"Content-Security-Policy\" content=\"${escapeAttr(csp)}\">`,
    `<title>${title}</title>`,
    "<style>html,body{margin:0;padding:0;font-family:system-ui,Segoe UI,PingFang SC,Hiragino Sans GB,Microsoft YaHei,sans-serif;background:transparent;}</style>",
    "</head>",
    "<body>",
    raw,
    "</body>",
    "</html>"
  ].join("\n");
}

function injectCspIntoDocument(doc: string, csp: string): string {
  // Strip any existing CSP meta so our policy wins and the reviewer cannot be
  // tricked by a permissive author-provided one.
  const stripped = doc.replace(
    /<meta[^>]+http-equiv\s*=\s*(?:"|')?\s*Content-Security-Policy[^>]*>/gi,
    ""
  );
  const meta = `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(csp)}">`;
  if (/<head[^>]*>/i.test(stripped)) {
    return stripped.replace(/<head([^>]*)>/i, (_m, attrs) => `<head${attrs}>\n${meta}`);
  }
  // No <head> — inject one.
  return stripped.replace(/<html([^>]*)>/i, (_m, attrs) => `<html${attrs}>\n<head>${meta}</head>`);
}

function escapeHtml(s: string): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return (s ?? "").replace(/"/g, "&quot;");
}

export function buildInlineEntryUrl(slug: string, version: string): string {
  const s = encodeURIComponent(slug);
  const v = encodeURIComponent(version);
  return `/api/cards/host/${s}/${v}/index.html`;
}

// Lazy lookup used by cardToDto so that inline cards approved before the
// packaging pipeline shipped still render.
export function ensureInlineEntryUrl(card: {
  host: string;
  entryUrl: string;
  slug: string;
  version: string;
}): string {
  if (card.host === "inline" && !card.entryUrl) {
    return buildInlineEntryUrl(card.slug, card.version);
  }
  return card.entryUrl;
}
