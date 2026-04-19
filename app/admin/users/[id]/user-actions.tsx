"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "../users.module.css";

interface Props {
  userId: string;
  role: "user" | "admin" | "superadmin";
  status: "active" | "disabled";
  initialName: string | null;
  initialAvatarUrl: string | null;
  initialEmail: string;
}

export function UserActions({
  userId,
  role,
  status,
  initialName,
  initialAvatarUrl,
  initialEmail
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [nameDraft, setNameDraft] = useState(initialName ?? "");
  const [avatarDraft, setAvatarDraft] = useState(initialAvatarUrl ?? "");
  const [emailDraft, setEmailDraft] = useState(initialEmail);
  const [profilePending, setProfilePending] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

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

  async function saveProfile() {
    if (profilePending) return;
    setProfilePending(true);
    setProfileMessage(null);
    setProfileError(null);

    const patch: Record<string, string | null> = {};
    const trimmedName = nameDraft.trim();
    const trimmedAvatar = avatarDraft.trim();
    const trimmedEmail = emailDraft.trim();

    if (trimmedName !== (initialName ?? "")) {
      patch.name = trimmedName || null;
    }
    if (trimmedAvatar !== (initialAvatarUrl ?? "")) {
      patch.avatarUrl = trimmedAvatar || null;
    }
    if (trimmedEmail !== initialEmail) {
      patch.email = trimmedEmail;
    }

    if (Object.keys(patch).length === 0) {
      setProfileError("没有变更。");
      setProfilePending(false);
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch)
      });
      const body = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
      if (!res.ok || body.code !== 0) {
        if (body.code === 1004) {
          const returnTo = window.location.pathname;
          window.location.href = `/api/auth/github/reauth?returnTo=${encodeURIComponent(returnTo)}`;
          return;
        }
        if (body.code === 2003) {
          setProfileError(body.message ?? "邮箱已被占用。");
        } else {
          setProfileError(body.message ?? `HTTP ${res.status}`);
        }
        return;
      }
      setProfileMessage("已保存。");
      router.refresh();
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : String(err));
    } finally {
      setProfilePending(false);
    }
  }

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

      <div className={styles.profileForm} style={{ marginTop: 12 }}>
        <label className={styles.profileFormLabel} htmlFor={`name-${userId}`}>昵称</label>
        <input
          id={`name-${userId}`}
          className={styles.profileFormInput}
          type="text"
          maxLength={64}
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          placeholder="留空则清空"
        />
        <label className={styles.profileFormLabel} htmlFor={`avatar-${userId}`}>头像 URL</label>
        <input
          id={`avatar-${userId}`}
          className={styles.profileFormInput}
          type="text"
          maxLength={512}
          value={avatarDraft}
          onChange={(e) => setAvatarDraft(e.target.value)}
          placeholder="http(s):// 或 / 开头"
        />
        <label className={styles.profileFormLabel} htmlFor={`email-${userId}`}>邮箱</label>
        <input
          id={`email-${userId}`}
          className={styles.profileFormInput}
          type="email"
          maxLength={254}
          value={emailDraft}
          onChange={(e) => setEmailDraft(e.target.value)}
        />
        <div className={styles.profileFormFoot}>
          {profileError ? <span className={styles.profileFormError}>{profileError}</span> : null}
          {profileMessage ? <span className={styles.profileFormOk}>{profileMessage}</span> : null}
          <button
            type="button"
            className={styles.actionBtn}
            onClick={saveProfile}
            disabled={profilePending}
          >
            {profilePending ? "保存中..." : "保存资料"}
          </button>
        </div>
      </div>
    </div>
  );
}
