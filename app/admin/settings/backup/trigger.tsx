"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../settings.module.css";

export function BackupTrigger() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/backup", { method: "POST" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
        if (body.code === 1004) {
          window.location.href = `/api/auth/github/reauth?returnTo=${encodeURIComponent(window.location.pathname)}`;
          return;
        }
        setError(body.message ?? `HTTP ${res.status}`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button type="button" className={styles.backupBtn} onClick={run} disabled={pending}>
        {pending ? "生成中..." : "触发新快照"}
      </button>
      {error ? <div className={styles.errorText}>{error}</div> : null}
    </div>
  );
}
