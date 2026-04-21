// Static security scan for inline card sources.
// Runs at submission time to block obviously dangerous patterns, and again at
// approval time so stale submissions that predate a scanner rule get caught.
//
// Two severities:
//   - blocker: submission is rejected at validation boundary.
//   - warning: surfaced to the reviewer UI but does not block approval.
//
// The intent is pattern-level defense, not a full parser. It catches the "low-
// hanging fruit" (eval, new Function, external http scripts, document.write,
// obfuscated eval via atob/String.fromCharCode) that an attacker would reach
// for first. CSP + sandbox + origin isolation are still the real boundary.

export interface ScanHit {
  code: string;
  message: string;
  excerpt?: string;
}

export interface ScanResult {
  blockers: ScanHit[];
  warnings: ScanHit[];
}

interface Rule {
  code: string;
  severity: "blocker" | "warning";
  pattern: RegExp;
  message: string;
}

const RULES: Rule[] = [
  {
    code: "eval",
    severity: "blocker",
    pattern: /\beval\s*\(/,
    message: "eval() 执行任意字符串代码，违反 CSP 与安全基线"
  },
  {
    code: "new-function",
    severity: "blocker",
    pattern: /\bnew\s+Function\s*\(/,
    message: "new Function() 等价于 eval，禁止使用"
  },
  {
    code: "document-write",
    severity: "blocker",
    pattern: /\bdocument\s*\.\s*write(?:ln)?\s*\(/,
    message: "document.write 会被 CSP 拦截并污染宿主 DOM"
  },
  {
    code: "script-timeout",
    severity: "blocker",
    pattern: /\b(?:setTimeout|setInterval)\s*\(\s*(?:"|'|`)/,
    message: "setTimeout/setInterval 以字符串形式执行代码视同 eval"
  },
  {
    code: "external-http-script",
    severity: "blocker",
    pattern: /<script[^>]+src\s*=\s*(?:"|')\s*http:\/\//i,
    message: "外部 http:// 脚本不安全，请使用 https 或内联代码"
  },
  {
    code: "external-protocol-script",
    severity: "blocker",
    pattern: /<script[^>]+src\s*=\s*(?:"|')\s*(?:file|javascript|data):/i,
    message: "外部 file/javascript/data: 脚本不被允许"
  },
  {
    code: "javascript-href",
    severity: "blocker",
    pattern: /\s(?:href|src|action|formaction)\s*=\s*(?:"|')\s*javascript:/i,
    message: "javascript: 协议 URL 不被允许"
  },
  {
    code: "inline-event-handler",
    severity: "warning",
    pattern: /\s(?:onclick|onload|onerror|onmouseover|onmouseout|onfocus|onblur|onchange|oninput|onsubmit)\s*=\s*(?:"|')/i,
    message: "内联事件处理器可能被 CSP 拦截，建议用 addEventListener"
  },
  {
    code: "external-https-script",
    severity: "warning",
    pattern: /<script[^>]+src\s*=\s*(?:"|')\s*https:\/\//i,
    message: "外部脚本会受宿主 CSP default-src 'self' 约束，可能加载失败"
  },
  {
    code: "atob-eval-chain",
    severity: "warning",
    pattern: /atob\s*\(/,
    message: "atob 常被用于绕过静态扫描，请确认不是在解码可执行代码"
  },
  {
    code: "fromcharcode-chain",
    severity: "warning",
    pattern: /String\s*\.\s*fromCharCode/,
    message: "String.fromCharCode 常用于混淆 JS，请确认用途"
  },
  {
    code: "top-navigation",
    severity: "warning",
    pattern: /\b(?:window|top|parent)\s*\.\s*location\s*(?:=|\.href\s*=)/,
    message: "卡片改写顶层 location 会跳出宿主；iframe sandbox 未放开 allow-top-navigation 时会被拦"
  },
  {
    code: "post-message-wildcard",
    severity: "warning",
    pattern: /postMessage\s*\([^)]*,\s*(?:"|')\*/,
    message: "postMessage 目标 origin 为 * 泄露消息给任意父页"
  },
  {
    code: "cookie-access",
    severity: "warning",
    pattern: /\bdocument\s*\.\s*cookie\b/,
    message: "sandbox 下 document.cookie 通常被屏蔽，卡片不应依赖 cookie"
  }
];

export function scanInlineSource(source: string | null | undefined): ScanResult {
  const blockers: ScanHit[] = [];
  const warnings: ScanHit[] = [];
  if (!source || !source.trim()) {
    return { blockers, warnings };
  }

  const stripped = stripHtmlComments(source);
  for (const rule of RULES) {
    const match = rule.pattern.exec(stripped);
    if (!match) continue;
    const hit: ScanHit = {
      code: rule.code,
      message: rule.message,
      excerpt: truncate(match[0], 120)
    };
    if (rule.severity === "blocker") blockers.push(hit);
    else warnings.push(hit);
  }

  return { blockers, warnings };
}

function stripHtmlComments(source: string): string {
  // HTML comments wouldn't otherwise hide dangerous code from the regex, but
  // stripping them reduces false positives when a comment literally mentions
  // "eval()" in a docstring.
  return source.replace(/<!--[\s\S]*?-->/g, "");
}

function truncate(s: string, max: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

export function formatScanForReason(result: ScanResult): string {
  const parts: string[] = [];
  for (const b of result.blockers) {
    parts.push(`[${b.code}] ${b.message}`);
  }
  return parts.join("；");
}
