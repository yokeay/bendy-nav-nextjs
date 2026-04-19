"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./templates.module.css";

interface Props {
  initialJson: string;
}

export function TemplatePublisher({ initialJson }: Props) {
  const router = useRouter();
  const [version, setVersion] = useState("");
  const [notes, setNotes] = useState("");
  const [json, setJson] = useState(initialJson);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function publish() {
    setError(null);
    setSuccess(null);
    if (!version.trim()) {
      setError("请填写版本号");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      setError(`JSON 无效：${(err as Error).message}`);
      return;
    }
    if (!parsed || typeof parsed !== "object") {
      setError("JSON 根必须是对象");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/admin/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version: version.trim(), content: parsed, notes: notes.trim() || undefined })
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
        if (body.code === 1004) {
          window.location.href = `/api/auth/github/reauth?returnTo=${encodeURIComponent(window.location.pathname)}`;
          return;
        }
        setError(body.message ?? `HTTP ${res.status}`);
        return;
      }
      setSuccess("发布成功");
      setVersion("");
      setNotes("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  function format() {
    try {
      setJson(JSON.stringify(JSON.parse(json), null, 2));
      setError(null);
    } catch (err) {
      setError(`JSON 无效：${(err as Error).message}`);
    }
  }

  return (
    <div className={styles.publisher}>
      <div className={styles.metaRow}>
        <input
          type="text"
          placeholder="版本号，如 2026.04.17"
          value={version}
          onChange={(e) => setVersion(e.target.value)}
          className={styles.input}
        />
        <input
          type="text"
          placeholder="备注（可选）"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={styles.input}
          style={{ flex: 1 }}
        />
      </div>
      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        spellCheck={false}
        className={styles.editor}
        rows={18}
      />
      <div className={styles.actions}>
        <button type="button" className={styles.secondaryBtn} onClick={format} disabled={pending}>格式化</button>
        <button type="button" className={styles.primaryBtn} onClick={publish} disabled={pending}>
          {pending ? "发布中..." : "发布新版本"}
        </button>
        {error ? <span className={styles.errorText}>{error}</span> : null}
        {success ? <span className={styles.successText}>{success}</span> : null}
      </div>
    </div>
  );
}
