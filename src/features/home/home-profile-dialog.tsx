"use client";

import { useEffect, useState } from "react";
import type { HomeUser } from "@/server/home/types";
import styles from "./home-page.module.css";

type ToastDispatcher = (message: string, tone?: "success" | "error" | "info") => void;

type HomeProfileDialogProps = {
  open: boolean;
  user: HomeUser;
  onClose: () => void;
  onSaved: (next: { name: string | null; avatarUrl: string | null }) => void;
  onNotify: ToastDispatcher;
};

export function HomeProfileDialog({ open, user, onClose, onSaved, onNotify }: HomeProfileDialogProps) {
  const [name, setName] = useState<string>("");
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(user.name ?? user.nickname ?? "");
    setAvatarUrl(user.avatarUrl ?? (user.avatar && !user.avatar.startsWith("/brand/") ? user.avatar : ""));
  }, [open, user]);

  useEffect(() => {
    if (!open) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          avatarUrl: avatarUrl.trim() || null
        })
      });
      const body = (await res.json().catch(() => ({}))) as {
        code?: number;
        message?: string;
        data?: { name: string | null; avatarUrl: string | null };
      };
      if (!res.ok || body.code !== 0) {
        onNotify(body.message ?? `保存失败 (HTTP ${res.status})`, "error");
        return;
      }
      onNotify("资料已更新。", "success");
      onSaved({
        name: body.data?.name ?? null,
        avatarUrl: body.data?.avatarUrl ?? null
      });
      onClose();
    } catch (err) {
      onNotify(err instanceof Error ? err.message : "保存失败。", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.authOverlay} role="dialog" aria-modal="true">
      <div className={styles.authBackdrop} onClick={onClose} />
      <div className={styles.authCard}>
        <h2 className={styles.authTitle}>修改资料</h2>
        <p className={styles.authSubtitle}>调整你的显示昵称与头像。</p>
        <label className={styles.profileField}>
          <span className={styles.profileFieldLabel}>昵称</span>
          <input
            className={styles.profileFieldInput}
            type="text"
            value={name}
            maxLength={64}
            onChange={(e) => setName(e.target.value)}
            placeholder={user.nickname || "请输入昵称"}
          />
        </label>
        <label className={styles.profileField}>
          <span className={styles.profileFieldLabel}>头像 URL</span>
          <input
            className={styles.profileFieldInput}
            type="text"
            value={avatarUrl}
            maxLength={512}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https:// 或 / 开头的路径"
          />
        </label>
        <div className={styles.profileActions}>
          <button
            type="button"
            className={styles.authCancelButton}
            onClick={onClose}
            disabled={saving}
          >
            取消
          </button>
          <button
            type="button"
            className={styles.authGithubButton}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
