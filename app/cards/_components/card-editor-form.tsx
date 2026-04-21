"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../cards.module.css";
import { CardPreview } from "./card-preview";
import {
  CARD_HOSTS,
  CARD_SIZES,
  INLINE_SOURCE_MAX_BYTES,
  SEMVER_RE,
  SLUG_RE,
  type CardHost,
  type CardSize
} from "@/server/cards/types";

const PERMISSION_PRESETS = [
  { value: "clipboard", label: "访问剪贴板" },
  { value: "location", label: "读取地理位置" },
  { value: "storage", label: "本地存储" },
  { value: "notifications", label: "桌面通知" },
  { value: "fullscreen", label: "全屏显示" },
  { value: "fetch.api.anthropic.com", label: "调用 anthropic 接口" }
];

export interface CardEditorInitialValue {
  id?: string;
  slug?: string;
  name?: string;
  nameEn?: string | null;
  tips?: string;
  description?: string;
  icon?: string;
  coverUrl?: string | null;
  host?: CardHost;
  entryUrl?: string;
  size?: CardSize;
  resizable?: boolean;
  permissions?: string[];
  sandbox?: string;
  inlineSource?: string | null;
  tags?: string[];
  version?: string;
  changelog?: string | null;
  authorName?: string | null;
  authorContact?: string | null;
  status?: "draft" | "submitted";
}

interface Props {
  mode: "create" | "edit";
  initial?: CardEditorInitialValue;
  defaultAuthorName?: string;
}

function slugifyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function CardEditorForm({ mode, initial, defaultAuthorName }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(initial?.slug));
  const [nameEn, setNameEn] = useState(initial?.nameEn ?? "");
  const [tips, setTips] = useState(initial?.tips ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [icon, setIcon] = useState(initial?.icon ?? "");
  const [coverUrl, setCoverUrl] = useState(initial?.coverUrl ?? "");
  const [host, setHost] = useState<CardHost>(initial?.host ?? "iframe");
  const [entryUrl, setEntryUrl] = useState(initial?.entryUrl ?? "");
  const [size, setSize] = useState<CardSize>(initial?.size ?? "2x4");
  const [resizable, setResizable] = useState(Boolean(initial?.resizable));
  const [inlineSource, setInlineSource] = useState(initial?.inlineSource ?? "");
  const [permissions, setPermissions] = useState<Set<string>>(
    new Set(initial?.permissions ?? [])
  );
  const [sandbox, setSandbox] = useState(initial?.sandbox ?? "allow-scripts allow-forms");
  const [tags, setTags] = useState((initial?.tags ?? []).join(", "));
  const [version, setVersion] = useState(initial?.version ?? "1.0.0");
  const [changelog, setChangelog] = useState(initial?.changelog ?? "");
  const [authorName, setAuthorName] = useState(initial?.authorName ?? defaultAuthorName ?? "");
  const [authorContact, setAuthorContact] = useState(initial?.authorContact ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const effectiveSlug = useMemo(() => (slugTouched ? slug : slugifyName(name)), [slug, slugTouched, name]);
  const inlineSize = useMemo(() => new Blob([inlineSource]).size, [inlineSource]);

  function togglePermission(value: string, on: boolean) {
    const next = new Set(permissions);
    if (on) next.add(value);
    else next.delete(value);
    setPermissions(next);
  }

  function buildPayload(statusChoice: "submitted" | "draft") {
    return {
      slug: effectiveSlug,
      name: name.trim(),
      nameEn: nameEn.trim() || null,
      tips: tips.trim(),
      description: description.trim(),
      icon: icon.trim(),
      coverUrl: coverUrl.trim() || null,
      host,
      entryUrl: entryUrl.trim(),
      size,
      resizable,
      permissions: Array.from(permissions),
      sandbox: sandbox.trim() || "allow-scripts allow-forms",
      inlineSource: host === "inline" ? inlineSource : null,
      tags: tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      version: SEMVER_RE.test(version.trim()) ? version.trim() : "1.0.0",
      changelog: changelog.trim() || null,
      authorName: authorName.trim() || null,
      authorContact: authorContact.trim() || null,
      status: statusChoice
    };
  }

  function validateClientSide(): string | null {
    if (!SLUG_RE.test(effectiveSlug)) {
      return "slug 必须是 2-40 位小写字母/数字/短横线，且以字母或数字开头";
    }
    if (!name.trim()) {
      return "卡片名称不能为空";
    }
    if ((host === "iframe" || host === "window") && !/^https:\/\//i.test(entryUrl.trim())) {
      return "iframe/window 宿主的 entryUrl 必须是 https 开头";
    }
    if (host === "inline") {
      if (!inlineSource.trim()) {
        return "inline 宿主必须提供 HTML/JS 源码";
      }
      if (inlineSize > INLINE_SOURCE_MAX_BYTES) {
        return `inline 源码 ${(inlineSize / 1024).toFixed(1)}KB 已超过 64KB 上限`;
      }
    }
    if (mode === "edit" && !changelog.trim()) {
      return "编辑已有提交时 changelog 不能为空";
    }
    return null;
  }

  async function submit(statusChoice: "submitted" | "draft") {
    const validationError = validateClientSide();
    if (validationError) {
      setError(validationError);
      setSuccess("");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const payload = buildPayload(statusChoice);
      const endpoint = mode === "edit" && initial?.id
        ? `/api/cards/submissions/${initial.id}`
        : `/api/cards/submissions`;
      const method = mode === "edit" && initial?.id ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || body?.code !== 0) {
        setError(body?.message || "提交失败，请稍后再试");
        return;
      }
      const auto = body?.data?.autoApproved === true;
      if (auto) {
        setSuccess("管理员账户提交已直接通过，卡片已入库。");
      } else if (statusChoice === "draft") {
        setSuccess("草稿已保存，可在「我的提交」里继续编辑。");
      } else {
        setSuccess("提交成功，等待管理员审核。");
      }
      router.refresh();
      if (mode === "create") {
        setTimeout(() => router.push("/cards/my"), 800);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.editorLayout}>
      <div className={styles.formCard}>
        <h2 className={styles.sectionTitle}>基础信息</h2>

        <div className={styles.row}>
          <div className={styles.rowLabel}>卡片名称<em>*</em></div>
          <div>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="示例：Weather Hub"
              maxLength={40}
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.rowLabel}>slug<em>*</em></div>
          <div>
            <input
              className={styles.input}
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              placeholder="weather-hub"
              maxLength={40}
            />
            <div className={styles.hint}>URL 友好唯一短名，2-40 位小写字母/数字/短横线。</div>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.rowLabel}>英文名</div>
          <div>
            <input className={styles.input} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.rowLabel}>一句话简介</div>
          <div>
            <input
              className={styles.input}
              value={tips}
              onChange={(e) => setTips(e.target.value)}
              maxLength={200}
              placeholder="在卡片列表下方展示"
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.rowLabel}>详细描述</div>
          <div>
            <textarea
              className={styles.textarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={4000}
              placeholder="支持 Markdown"
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.rowLabel}>图标 URL</div>
          <div>
            <input
              className={styles.input}
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.rowLabel}>封面 URL</div>
          <div>
            <input
              className={styles.input}
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="https://... 用于卡片详情顶部"
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.rowLabel}>标签</div>
          <div>
            <input
              className={styles.input}
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="天气, 工具, 日常"
            />
            <div className={styles.hint}>逗号分隔，最多 20 个</div>
          </div>
        </div>

        <h2 className={styles.sectionTitle}>宿主与入口</h2>

        <div className={styles.row}>
          <div className={styles.rowLabel}>运行宿主<em>*</em></div>
          <div>
            <div className={styles.hostGroup}>
              {CARD_HOSTS.map((h) => (
                <button
                  key={h}
                  type="button"
                  className={host === h ? `${styles.hostButton} ${styles.hostButtonActive}` : styles.hostButton}
                  onClick={() => setHost(h)}
                >
                  {h}
                </button>
              ))}
            </div>
            <div className={styles.hint}>
              iframe: 嵌入到首页卡片网格；window: 点击后弹出窗口；inline: 提交 HTML/JS 源码代为托管（本轮打包能力未开放）
            </div>
          </div>
        </div>

        {host !== "inline" ? (
          <div className={styles.row}>
            <div className={styles.rowLabel}>entryUrl<em>*</em></div>
            <div>
              <input
                className={styles.input}
                value={entryUrl}
                onChange={(e) => setEntryUrl(e.target.value)}
                placeholder="https://example.com/card"
              />
              <div className={styles.hint}>必须 HTTPS，且目标站点 X-Frame-Options/CSP 允许嵌入</div>
            </div>
          </div>
        ) : (
          <div className={styles.row}>
            <div className={styles.rowLabel}>inline 源码<em>*</em></div>
            <div>
              <textarea
                className={`${styles.textarea} ${styles.textareaLarge}`}
                value={inlineSource}
                onChange={(e) => setInlineSource(e.target.value)}
                placeholder="<!doctype html>\n<html>\n...\n</html>"
                maxLength={INLINE_SOURCE_MAX_BYTES * 2}
              />
              <div className={styles.hint}>
                {(inlineSize / 1024).toFixed(1)}KB / 64KB 上限 — 发布时会由系统自动注入默认 CSP。
              </div>
            </div>
          </div>
        )}

        <div className={styles.row}>
          <div className={styles.rowLabel}>默认尺寸</div>
          <div>
            <div className={styles.sizeGroup}>
              {CARD_SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={size === s ? `${styles.sizeButton} ${styles.sizeButtonActive}` : styles.sizeButton}
                  onClick={() => setSize(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.rowLabel}>允许缩放</div>
          <div>
            <label className={styles.permItem}>
              <input type="checkbox" checked={resizable} onChange={(e) => setResizable(e.target.checked)} />
              <span>用户可在宿主中调整尺寸</span>
            </label>
          </div>
        </div>

        <h2 className={styles.sectionTitle}>能力与安全</h2>

        <div className={styles.row}>
          <div className={styles.rowLabel}>请求的权限</div>
          <div>
            <div className={styles.permGrid}>
              {PERMISSION_PRESETS.map((p) => (
                <label key={p.value} className={styles.permItem}>
                  <input
                    type="checkbox"
                    checked={permissions.has(p.value)}
                    onChange={(e) => togglePermission(p.value, e.target.checked)}
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>
            <div className={styles.hint}>未勾选的能力在运行时会被宿主 Proxy 拦截</div>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.rowLabel}>iframe sandbox</div>
          <div>
            <input
              className={styles.input}
              value={sandbox}
              onChange={(e) => setSandbox(e.target.value)}
              placeholder="allow-scripts allow-forms"
            />
            <div className={styles.hint}>空格分隔，仅 iframe/window 宿主生效</div>
          </div>
        </div>

        <h2 className={styles.sectionTitle}>版本与作者</h2>

        <div className={styles.row}>
          <div className={styles.rowLabel}>版本号</div>
          <div>
            <input
              className={styles.input}
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="1.0.0"
            />
          </div>
        </div>

        {mode === "edit" ? (
          <div className={styles.row}>
            <div className={styles.rowLabel}>changelog<em>*</em></div>
            <div>
              <textarea
                className={styles.textarea}
                value={changelog}
                onChange={(e) => setChangelog(e.target.value)}
                placeholder="本次改了什么"
              />
            </div>
          </div>
        ) : null}

        <div className={styles.row}>
          <div className={styles.rowLabel}>作者显示名</div>
          <div>
            <input
              className={styles.input}
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="在卡片详情展示"
            />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.rowLabel}>联系方式</div>
          <div>
            <input
              className={styles.input}
              value={authorContact}
              onChange={(e) => setAuthorContact(e.target.value)}
              placeholder="邮箱 / GitHub / 其他"
            />
          </div>
        </div>

        {error ? <div className={styles.errorText}>{error}</div> : null}
        {success ? <div className={styles.successText}>{success}</div> : null}

        <div className={styles.actionsRow}>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={submitting}
            onClick={() => void submit("submitted")}
          >
            {submitting ? "提交中..." : "提交审核"}
          </button>
          <button
            type="button"
            className={styles.btnGhost}
            disabled={submitting}
            onClick={() => void submit("draft")}
          >
            保存草稿
          </button>
        </div>
      </div>

      <CardPreview
        name={name.trim() || "未命名卡片"}
        tips={tips.trim()}
        icon={icon.trim()}
        host={host}
        size={size}
        version={version}
      />
    </div>
  );
}
