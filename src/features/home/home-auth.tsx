"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import type { HomeSiteInfo, HomeUser } from "@/server/home/types";
import { clearAuthCookies, persistAuthCookies, requestLegacy, type AuthPayload } from "./home-client";
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
};

type AuthMode = "login" | "register" | "reset";

type AuthFormState = {
  username: string;
  password: string;
  code: string;
  oldPassword: string;
};

const DEFAULT_FORM_STATE: AuthFormState = {
  username: "",
  password: "",
  code: "",
  oldPassword: ""
};

function resetForm(): AuthFormState {
  return { ...DEFAULT_FORM_STATE };
}

function validateEmailInput(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function useMailCodeCountdown() {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (seconds <= 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setSeconds((current) => current - 1);
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [seconds]);

  return {
    seconds,
    start() {
      setSeconds(60);
    }
  };
}

export function AuthDialog({ open, site, onClose, onNotify }: AuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [form, setForm] = useState<AuthFormState>(resetForm);
  const [submitting, setSubmitting] = useState(false);
  const codeTimer = useMailCodeCountdown();

  useEffect(() => {
    if (!open) {
      setMode("login");
      setForm(resetForm());
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [onClose, open]);

  const title = useMemo(() => {
    if (mode === "register") {
      return "注册您的账户";
    }
    if (mode === "reset") {
      return "重置您的账户";
    }
    return "登录您的账户";
  }, [mode]);

  async function handleMailCode() {
    const email = form.username.trim();
    if (!validateEmailInput(email)) {
      onNotify("请输入有效邮箱。", "error");
      return;
    }

    try {
      const response = await requestLegacy<unknown>("/api/getMailCode", {
        method: "POST",
        data: { mail: email }
      });
      onNotify(response.msg || "验证码已发送。", "success");
      codeTimer.start();
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "验证码发送失败。", "error");
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const username = form.username.trim();
    const password = form.password.trim();

    if (!validateEmailInput(username)) {
      onNotify("请输入有效邮箱。", "error");
      return;
    }

    if (password.length < 6) {
      onNotify("密码至少需要 6 位。", "error");
      return;
    }

    setSubmitting(true);

    try {
      if (mode === "login") {
        const response = await requestLegacy<AuthPayload>("/user/login", {
          method: "POST",
          data: { username, password }
        });
        persistAuthCookies(response.data);
        onNotify(response.msg || "登录成功。", "success");
        window.location.reload();
        return;
      }

      if (mode === "register") {
        await requestLegacy<unknown>("/user/register", {
          method: "POST",
          data: {
            username,
            password,
            code: site.authCheckMode === "email_code" ? form.code.trim() || "0000" : "0000"
          }
        });

        const response = await requestLegacy<AuthPayload>("/user/login", {
          method: "POST",
          data: { username, password }
        });
        persistAuthCookies(response.data);
        onNotify("注册完成，已自动登录。", "success");
        window.location.reload();
        return;
      }

      await requestLegacy<unknown>("/user/forgetPass", {
        method: "POST",
        data: {
          username,
          password,
          code: site.authCheckMode === "email_code" ? form.code.trim() || "0000" : "0000",
          oldPassword: site.authCheckMode === "old_password" ? form.oldPassword.trim() : ""
        }
      });

      setMode("login");
      setForm({
        username,
        password,
        code: "",
        oldPassword: ""
      });
      onNotify("密码已重置，请使用新密码登录。", "success");
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "请求失败。", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className={styles.authBackdrop} onClick={onClose}>
      <div className={styles.authLoginCard} onClick={(event) => event.stopPropagation()}>
        <div className={styles.authLoginVisual}>
          <img className={styles.authVisualImage} src="/brand/logo-512.png" alt={site.title} />
          <div className={styles.authVisualOverlay}>
            <p className={styles.authVisualEyebrow}>笨迪导航</p>
            <h2 className={styles.authVisualTitle}>{site.title}</h2>
            <p className={styles.authVisualText}>登录后同步首页布局、Dock 和搜索偏好。</p>
          </div>
        </div>

        <div className={styles.authDialog}>
          <button className={styles.authClose} type="button" onClick={onClose} aria-label="关闭">
            ×
          </button>

          <div className={styles.authHeader}>
            <div>
              <p className={styles.authEyebrow}>账户</p>
              <h2 className={styles.authTitle}>{title}</h2>
            </div>
          </div>

          <div className={styles.authTabs}>
            <button
              className={mode === "login" ? styles.authTabActive : styles.authTab}
              type="button"
              onClick={() => setMode("login")}
            >
              登录
            </button>
            {site.allowRegister ? (
              <button
                className={mode === "register" ? styles.authTabActive : styles.authTab}
                type="button"
                onClick={() => setMode("register")}
              >
                注册
              </button>
            ) : null}
            <button
              className={mode === "reset" ? styles.authTabActive : styles.authTab}
              type="button"
              onClick={() => setMode("reset")}
            >
              找回
            </button>
          </div>

          <form className={styles.authForm} onSubmit={handleSubmit}>
            <label className={styles.authLabel}>
              <span>邮箱账号</span>
              <input
                className={styles.authInput}
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
                placeholder="请输入邮箱"
                autoComplete="email"
              />
            </label>

            <label className={styles.authLabel}>
              <span>{mode === "reset" ? "新密码" : "登录密码"}</span>
              <input
                className={styles.authInput}
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder="请输入6-18位密码"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </label>

            {mode === "register" && site.authCheckMode === "email_code" ? (
              <label className={styles.authLabel}>
                <span>邮箱验证码</span>
                <div className={styles.authInlineField}>
                  <input
                    className={styles.authInput}
                    value={form.code}
                    onChange={(event) => setForm({ ...form, code: event.target.value })}
                    placeholder="请输入验证码"
                  />
                  <button
                    className={styles.authSecondaryButton}
                    type="button"
                    disabled={codeTimer.seconds > 0}
                    onClick={handleMailCode}
                  >
                    {codeTimer.seconds > 0 ? `${codeTimer.seconds}s` : "获取"}
                  </button>
                </div>
              </label>
            ) : null}

            {mode === "reset" && site.authCheckMode === "old_password" ? (
              <label className={styles.authLabel}>
                <span>旧密码</span>
                <input
                  className={styles.authInput}
                  type="password"
                  value={form.oldPassword}
                  onChange={(event) => setForm({ ...form, oldPassword: event.target.value })}
                  placeholder="请输入旧密码"
                />
              </label>
            ) : null}

            {mode === "reset" && site.authCheckMode === "email_code" ? (
              <label className={styles.authLabel}>
                <span>邮箱验证码</span>
                <div className={styles.authInlineField}>
                  <input
                    className={styles.authInput}
                    value={form.code}
                    onChange={(event) => setForm({ ...form, code: event.target.value })}
                    placeholder="请输入验证码"
                  />
                  <button
                    className={styles.authSecondaryButton}
                    type="button"
                    disabled={codeTimer.seconds > 0}
                    onClick={handleMailCode}
                  >
                    {codeTimer.seconds > 0 ? `${codeTimer.seconds}s` : "获取"}
                  </button>
                </div>
              </label>
            ) : null}

            <button className={styles.authSubmit} type="submit" disabled={submitting}>
              {submitting ? "处理中..." : mode === "login" ? "登录" : mode === "register" ? "提交注册" : "提交"}
            </button>
          </form>

          {mode === "login" && (site.qqLoginEnabled || site.wxLoginEnabled) ? (
            <div className={styles.authSocial}>
              <div className={styles.authSocialDivider} />
              <div className={styles.authSocialRow}>
                {site.qqLoginEnabled ? (
                  <button
                    className={styles.authSocialButton}
                    type="button"
                    onClick={() => onNotify("QQ 登录路径暂时保留在兼容入口。", "info")}
                    title="QQ登录"
                  >
                    <img src="/static/qq_symbol.png" alt="" />
                  </button>
                ) : null}
                {site.wxLoginEnabled ? (
                  <button
                    className={styles.authSocialButton}
                    type="button"
                    onClick={() => onNotify("微信登录路径暂时保留在兼容入口。", "info")}
                    title="微信登录"
                  >
                    微
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function UserMenu({ user, legacyUrl, onNotify }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.closest("[data-home-user-menu='true']")) {
        return;
      }

      setOpen(false);
    }

    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [open]);

  async function handleLogout() {
    if (pending) {
      return;
    }

    setPending(true);
    try {
      await requestLegacy<unknown>("/user/loginOut", {
        method: "POST"
      });
    } catch (error) {
      onNotify(error instanceof Error ? error.message : "退出登录失败。", "error");
      setPending(false);
      return;
    }

    clearAuthCookies();
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
            <LinkButton href={legacyUrl}>{user.manager ? "进入管理后台" : "打开兼容入口"}</LinkButton>
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

function LinkButton({ href, children }: { href: string; children: string }) {
  return (
    <a className={styles.userPanelAction} href={href}>
      {children}
    </a>
  );
}
