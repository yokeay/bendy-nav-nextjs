"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./wallpapers.module.css";

type Mode = "single" | "json";

export function WallpaperUploader() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("single");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // single form state
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [hdUrl, setHdUrl] = useState("");
  const [description, setDescription] = useState("");
  const [colorMode, setColorMode] = useState<"day" | "night">("day");

  // json form state
  const [json, setJson] = useState(
    '[\n  {\n    "name": "示例壁纸",\n    "url": "https://example.com/wall.jpg",\n    "hdUrl": "https://example.com/wall_hd.jpg",\n    "description": "示例描述",\n    "colorMode": "day"\n  }\n]'
  );

  function resetSingle() {
    setName("");
    setUrl("");
    setHdUrl("");
    setDescription("");
  }

  async function submitSingle(event: FormEvent) {
    event.preventDefault();
    if (!name.trim() || !url.trim()) {
      setError("壁纸名称与壁纸地址为必填");
      return;
    }
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/wallpapers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "single",
          entry: { name, url, hdUrl, description, colorMode }
        })
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? `HTTP ${res.status}`);
        return;
      }
      setMessage("已添加壁纸。");
      resetSingle();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  async function submitJson(event: FormEvent) {
    event.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      setError("JSON 解析失败：" + (err instanceof Error ? err.message : String(err)));
      return;
    }
    if (!Array.isArray(parsed)) {
      setError("JSON 必须是数组");
      return;
    }
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/wallpapers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "json", entries: parsed })
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? `HTTP ${res.status}`);
        return;
      }
      const body = (await res.json()) as {
        data?: { created: number; failed: number; errors: { index: number; message: string }[] };
      };
      const created = body.data?.created ?? 0;
      const failed = body.data?.failed ?? 0;
      setMessage(`导入完成：成功 ${created} 条，失败 ${failed} 条。`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.uploader}>
      <div className={styles.modeTabs}>
        <button
          type="button"
          className={mode === "single" ? styles.modeTabActive : styles.modeTab}
          onClick={() => setMode("single")}
        >
          单条录入
        </button>
        <button
          type="button"
          className={mode === "json" ? styles.modeTabActive : styles.modeTab}
          onClick={() => setMode("json")}
        >
          JSON 批量导入
        </button>
      </div>

      {mode === "single" ? (
        <form onSubmit={submitSingle} className={styles.singleForm}>
          <label className={styles.field}>
            <span>壁纸名称</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              className={styles.input}
            />
          </label>
          <label className={styles.field}>
            <span>壁纸地址</span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://..."
              className={styles.input}
            />
          </label>
          <label className={styles.field}>
            <span>高清地址</span>
            <input
              type="url"
              value={hdUrl}
              onChange={(e) => setHdUrl(e.target.value)}
              placeholder="https://... (可选)"
              className={styles.input}
            />
          </label>
          <label className={styles.field}>
            <span>描述</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={styles.input}
              rows={2}
            />
          </label>
          <label className={styles.field}>
            <span>主题色</span>
            <div className={styles.segmentGroup}>
              <button
                type="button"
                className={colorMode === "day" ? styles.segmentActive : styles.segment}
                onClick={() => setColorMode("day")}
              >
                白天
              </button>
              <button
                type="button"
                className={colorMode === "night" ? styles.segmentActive : styles.segment}
                onClick={() => setColorMode("night")}
              >
                夜间
              </button>
            </div>
          </label>
          <div className={styles.formActions}>
            <button type="submit" className={styles.uploadBtn} disabled={pending}>
              {pending ? "保存中..." : "添加壁纸"}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={submitJson} className={styles.jsonForm}>
          <p className={styles.hint}>
            每个对象字段：<code>name</code>、<code>url</code>、<code>hdUrl</code>、
            <code>description</code>、<code>colorMode</code>（&quot;day&quot; | &quot;night&quot;）
          </p>
          <textarea
            value={json}
            onChange={(e) => setJson(e.target.value)}
            rows={12}
            spellCheck={false}
            className={styles.jsonTextarea}
          />
          <div className={styles.formActions}>
            <button type="submit" className={styles.uploadBtn} disabled={pending}>
              {pending ? "导入中..." : "批量导入"}
            </button>
          </div>
        </form>
      )}

      {error ? <div className={styles.errorText}>{error}</div> : null}
      {message ? <div className={styles.successText}>{message}</div> : null}
    </div>
  );
}
