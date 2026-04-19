"use client";

import { useEffect, useState } from "react";
import type { HomeSiteInfo, HomeUser } from "@/server/home/types";
import styles from "./home-page.module.css";

type ToastDispatcher = (message: string, tone?: "success" | "error" | "info") => void;

type AuthDialogProps = {
  open: boolean;
  site: HomeSiteInfo;
  onClose: () => void;
  onNotify: ToastDispatcher;
};

type UserMenuProps = {
  user: HomeUser;
  legacyUrl: string;
  onNotify: ToastDispatcher;
  onOpenProfile?: () => void;
};

function buildReturnTo(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname + window.location.search;
}

function startGitHubLogin(mode: "login" | "reauth" = "login") {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams({ returnTo: buildReturnTo() });
  if (mode === "reauth") params.set("mode", "reauth");
  window.location.href = `/api/auth/github/start?${params.toString()}`;
}

export function AuthDialog({ open, site, onClose, onNotify }: AuthDialogProps) {
  void site;
  void onNotify;

  useEffect(() => {
    if (!open) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className={styles.authOverlay} role="dialog" aria-modal="true">
      <div className={styles.authBackdrop} onClick={onClose} />
      <div className={styles.authCard}>
        <h2 className={styles.authTitle}>登录 / 注册</h2>
        <p className={styles.authSubtitle}>通过 GitHub 授权即可完成登录与注册。</p>
        <button
          type="button"
          className={styles.authGithubButton}
          onClick={() => startGitHubLogin("login")}
        >
          <GitHubMark />
          <span>使用 GitHub 登录</span>
        </button>
        <button type="button" className={styles.authCancelButton} onClick={onClose}>
          取消
        </button>
      </div>
    </div>
  );
}

export function UserMenu({ user, legacyUrl, onNotify, onOpenProfile }: UserMenuProps) {
  void legacyUrl;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.closest("[data-home-user-menu='true']")) return;
      setOpen(false);
    }
    window.addEventListener("mousedown", handlePointerDown);
    return () => window.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  async function handleLogout() {
    if (pending) return;
    setPending(true);
    try {
      await fetch("/api/auth/github/logout", { method: "POST", credentials: "include" });
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "退出登录失败。", "error");
      setPending(false);
      return;
    }
    onNotify("已退出登录。", "success");
    window.location.reload();
  }

  return (
    <div className={styles.userMenuRoot} data-home-user-menu="true">
      <button
        className={styles.userButton}
        type="button"
        title="打开账户菜单"
        aria-label="打开账户菜单"
        onClick={() => setOpen(!open)}
      >
        <img className={styles.userAvatar} src={user.avatar} alt={user.nickname || user.email || "用户"} />
        <span className={styles.userButtonText}>{user.nickname || user.email || `用户 #${user.userId}`}</span>
      </button>

      {open ? (
        <div className={styles.userPanel}>
          <div className={styles.userPanelHeader}>
            <img className={styles.userAvatarLarge} src={user.avatar} alt={user.nickname || user.email || "用户"} />
            <div>
              <p className={styles.userPanelName}>{user.nickname || `用户 #${user.userId}`}</p>
              <p className={styles.userPanelMeta}>{user.email || `ID ${user.userId}`}</p>
            </div>
          </div>
          <div className={styles.userPanelActions}>
            {user.manager ? (
              <a className={styles.userPanelAction} href="/admin">进入管理后台</a>
            ) : null}
            {onOpenProfile ? (
              <button
                className={styles.userPanelAction}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenProfile();
                }}
              >
                修改资料
              </button>
            ) : null}
            <button
              className={styles.userPanelAction}
              type="button"
              onClick={handleLogout}
              disabled={pending}
            >
              {pending ? "退出中..." : "退出登录"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GitHubMark() {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.42 7.42 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}
