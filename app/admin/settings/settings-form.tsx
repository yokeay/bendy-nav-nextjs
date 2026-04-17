"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./settings.module.css";

export interface SiteConfigView {
  title: string;
  description: string | null;
  icp: string | null;
  logo: string | null;
  maintenance: boolean;
}

export function SettingsForm({ initial }: { initial: SiteConfigView }) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function save() {
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form)
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
      setSuccess("已保存");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.formCard}>
      <label className={styles.field}>
        <span className={styles.label}>站点标题</span>
        <input
          className={styles.input}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>站点描述</span>
        <input
          className={styles.input}
          value={form.description ?? ""}
          onChange={(e) => setForm({ ...form, description: e.target.value || null })}
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>备案号</span>
        <input
          className={styles.input}
          value={form.icp ?? ""}
          onChange={(e) => setForm({ ...form, icp: e.target.value || null })}
          placeholder="例如：京ICP备XXXXXX号"
        />
      </label>

      <label className={styles.field}>
        <span className={styles.label}>Logo URL</span>
        <input
          className={styles.input}
          value={form.logo ?? ""}
          onChange={(e) => setForm({ ...form, logo: e.target.value || null })}
          placeholder="/brand/logo-192.png"
        />
      </label>

      <label className={styles.toggleField}>
        <input
          type="checkbox"
          checked={form.maintenance}
          onChange={(e) => setForm({ ...form, maintenance: e.target.checked })}
        />
        <span>维护模式（前台仅允许管理员访问）</span>
      </label>

      <div className={styles.actions}>
        <button type="button" className={styles.primaryBtn} onClick={save} disabled={pending}>
          {pending ? "保存中..." : "保存"}
        </button>
        {error ? <span className={styles.errorText}>{error}</span> : null}
        {success ? <span className={styles.successText}>{success}</span> : null}
      </div>
    </div>
  );
}
