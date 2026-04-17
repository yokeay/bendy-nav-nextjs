"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../users.module.css";

interface Props {
  userId: string;
  role: "user" | "admin" | "superadmin";
  status: "active" | "disabled";
}

export function UserActions({ userId, role, status }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(action: string, fetcher: () => Promise<Response>) {
    setPending(action);
    setError(null);
    try {
      const res = await fetcher();
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string; code?: number };
        if (body.code === 1004) {
          const returnTo = window.location.pathname;
          window.location.href = `/api/auth/github/reauth?returnTo=${encodeURIComponent(returnTo)}`;
          return;
        }
        setError(body.message ?? `HTTP ${res.status}`);
        return;
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  }

  const toggleStatus = () =>
    call("toggle", () =>
      fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: status === "active" ? "disabled" : "active" })
      })
    );

  const changeRole = (next: "user" | "admin" | "superadmin") =>
    call("role", () =>
      fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: next })
      })
    );

  const revokeSessions = () =>
    call("revoke", () =>
      fetch(`/api/admin/users/${userId}/revoke-sessions`, { method: "POST" })
    );

  const softDelete = () => {
    if (!confirm("软删除该用户？会同时吊销所有会话。")) return;
    call("delete", () =>
      fetch(`/api/admin/users/${userId}`, { method: "DELETE" })
    );
  };

  return (
    <div>
      <div className={styles.actionRow}>
        <button
          type="button"
          className={`${styles.actionBtn} ${status === "active" ? styles.actionDanger : styles.actionPrimary}`}
          onClick={toggleStatus}
          disabled={pending !== null}
        >
          {status === "active" ? "禁用" : "启用"}
        </button>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={revokeSessions}
          disabled={pending !== null}
        >
          吊销所有会话
        </button>
        {(["user", "admin", "superadmin"] as const)
          .filter((r) => r !== role)
          .map((r) => (
            <button
              key={r}
              type="button"
              className={styles.actionBtn}
              onClick={() => changeRole(r)}
              disabled={pending !== null}
            >
              改为 {r}
            </button>
          ))}
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionDanger}`}
          onClick={softDelete}
          disabled={pending !== null}
        >
          软删除
        </button>
      </div>
      {error ? <p style={{ color: "#c84142", fontSize: 12 }}>{error}</p> : null}
    </div>
  );
}
