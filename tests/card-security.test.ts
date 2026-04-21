import { describe, it, expect } from "vitest";
import { scanInlineSource, formatScanForReason } from "../src/server/cards/security-scan";
import {
  packInlineSource,
  buildInlineEntryUrl,
  ensureInlineEntryUrl,
  DEFAULT_CARD_CSP
} from "../src/server/cards/packaging";

describe("scanInlineSource", () => {
  it("passes clean inline source", () => {
    const src = `<div id="out"></div><script>const el=document.getElementById('out');el.textContent='hi';</script>`;
    const r = scanInlineSource(src);
    expect(r.blockers).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("blocks eval()", () => {
    const r = scanInlineSource(`<script>eval('1+1')</script>`);
    expect(r.blockers.some((h) => h.code === "eval")).toBe(true);
  });

  it("blocks new Function()", () => {
    const r = scanInlineSource(`<script>new Function('return 1')();</script>`);
    expect(r.blockers.some((h) => h.code === "new-function")).toBe(true);
  });

  it("blocks document.write", () => {
    const r = scanInlineSource(`<script>document.write('<b>x</b>')</script>`);
    expect(r.blockers.some((h) => h.code === "document-write")).toBe(true);
  });

  it("blocks string setTimeout", () => {
    const r = scanInlineSource(`<script>setTimeout("doStuff()", 100)</script>`);
    expect(r.blockers.some((h) => h.code === "script-timeout")).toBe(true);
  });

  it("blocks external http script", () => {
    const r = scanInlineSource(`<script src="http://evil.example/a.js"></script>`);
    expect(r.blockers.some((h) => h.code === "external-http-script")).toBe(true);
  });

  it("blocks javascript: href", () => {
    const r = scanInlineSource(`<a href="javascript:alert(1)">x</a>`);
    expect(r.blockers.some((h) => h.code === "javascript-href")).toBe(true);
  });

  it("warns on inline event handlers", () => {
    const r = scanInlineSource(`<button onclick="doStuff()">go</button>`);
    expect(r.warnings.some((h) => h.code === "inline-event-handler")).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it("warns on external https script", () => {
    const r = scanInlineSource(`<script src="https://cdn.example/a.js"></script>`);
    expect(r.warnings.some((h) => h.code === "external-https-script")).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it("warns on postMessage wildcard target", () => {
    const r = scanInlineSource(`<script>parent.postMessage({x:1}, '*')</script>`);
    expect(r.warnings.some((h) => h.code === "post-message-wildcard")).toBe(true);
  });

  it("ignores patterns inside HTML comments", () => {
    const r = scanInlineSource(`<!-- eval() is banned --><div>ok</div>`);
    expect(r.blockers).toEqual([]);
  });

  it("handles empty source gracefully", () => {
    const r = scanInlineSource("");
    expect(r.blockers).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("formatScanForReason joins blockers with ；", () => {
    const r = scanInlineSource(`<script>eval('a');document.write('b');</script>`);
    const s = formatScanForReason(r);
    expect(s).toContain("[eval]");
    expect(s).toContain("[document-write]");
    expect(s.includes("；") || r.blockers.length < 2).toBe(true);
  });
});

describe("packInlineSource", () => {
  it("wraps a raw fragment into a full document with CSP meta", () => {
    const html = packInlineSource("<p>hi</p>", { title: "Hi" });
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain("<p>hi</p>");
    expect(html).toContain(`http-equiv="Content-Security-Policy"`);
    expect(html).toContain("default-src 'self'");
  });

  it("escapes the title", () => {
    const html = packInlineSource("<p>x</p>", { title: "<script>alert(1)</script>" });
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toMatch(/<title><script>alert\(1\)<\/script><\/title>/);
  });

  it("injects CSP into an already-complete document", () => {
    const doc = `<!doctype html><html><head><title>Old</title></head><body>x</body></html>`;
    const html = packInlineSource(doc, { title: "New" });
    expect(html).toContain(`http-equiv="Content-Security-Policy"`);
    expect(html).toContain("<title>Old</title>");
  });

  it("strips any author-provided CSP meta and uses ours", () => {
    const attacker = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src *"><title>x</title></head><body>x</body></html>`;
    const html = packInlineSource(attacker, { title: "x" });
    expect(html).not.toContain("default-src *");
    expect(html).toContain("default-src 'self'");
  });

  it("accepts a custom CSP override", () => {
    const html = packInlineSource("<p>x</p>", { title: "x", csp: "default-src 'none'" });
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain(DEFAULT_CARD_CSP);
  });
});

describe("entry URL helpers", () => {
  it("buildInlineEntryUrl encodes slug and version", () => {
    expect(buildInlineEntryUrl("weather-hub", "1.0.0")).toBe(
      "/api/cards/host/weather-hub/1.0.0/index.html"
    );
    expect(buildInlineEntryUrl("a b", "1.0.0")).toBe("/api/cards/host/a%20b/1.0.0/index.html");
  });

  it("ensureInlineEntryUrl only fills blanks for inline host", () => {
    expect(
      ensureInlineEntryUrl({ host: "inline", entryUrl: "", slug: "w", version: "1.0.0" })
    ).toBe("/api/cards/host/w/1.0.0/index.html");
    expect(
      ensureInlineEntryUrl({ host: "inline", entryUrl: "/existing", slug: "w", version: "1.0.0" })
    ).toBe("/existing");
    expect(
      ensureInlineEntryUrl({ host: "iframe", entryUrl: "", slug: "w", version: "1.0.0" })
    ).toBe("");
  });
});
