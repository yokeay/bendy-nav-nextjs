"use client";

import { useEffect, useState } from "react";
import type { HomeLink } from "@/server/home/types";
import { requestLegacy } from "./home-client";
import styles from "./home-page.module.css";

type ActionDialogProps = {
  open: boolean;
  onClose: () => void;
};

type AddLinkDialogProps = ActionDialogProps & {
  activeGroupId: string;
  onSave: (payload: {
    name: string;
    url: string;
    src: string;
    bgColor: string;
    pageGroup: string;
  }) => Promise<void>;
};

type BackgroundDialogProps = ActionDialogProps & {
  currentBackground: string;
  onApply: (backgroundUrl: string) => Promise<void>;
};

type ClassFolderIcon = {
  src: string;
  name: string;
};

type CardImageItem = {
  thumbor: string;
  url: string;
};

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://")
  ) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

export function AddLinkDialog({ open, activeGroupId, onClose, onSave }: AddLinkDialogProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [icon, setIcon] = useState("");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [submitting, setSubmitting] = useState(false);
  const [folderIcons, setFolderIcons] = useState<ClassFolderIcon[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }

    requestLegacy<ClassFolderIcon[]>("/index/classFolderIcons")
      .then((response) => {
        setFolderIcons(response.data);
        if (!icon && response.data[0]?.src) {
          setIcon(response.data[0].src);
        }
      })
      .catch(() => {
        setFolderIcons([]);
      });
  }, [open, icon]);

  useEffect(() => {
    if (!open) {
      setName("");
      setUrl("");
      setIcon("");
      setBgColor("#ffffff");
      setSubmitting(false);
    }
  }, [open]);

  async function handleSubmit() {
    if (submitting) {
      return;
    }

    const normalizedName = name.trim();
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedName || !normalizedUrl) {
      return;
    }

    setSubmitting(true);
    try {
      await onSave({
        name: normalizedName,
        url: normalizedUrl,
        src: icon || "/static/addIco.png",
        bgColor,
        pageGroup: activeGroupId
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className={styles.actionBackdrop} onClick={onClose}>
      <div className={styles.actionDialog} onClick={(event) => event.stopPropagation()}>
        <div className={styles.actionHeader}>
          <div>
            <p className={styles.actionEyebrow}>快捷操作</p>
            <h2 className={styles.actionTitle}>添加标签</h2>
          </div>
          <button className={styles.actionClose} type="button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className={styles.actionForm}>
          <label className={styles.actionLabel}>
            <span>标签名称</span>
            <input
              className={styles.actionInput}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：GitHub"
            />
          </label>

          <label className={styles.actionLabel}>
            <span>跳转地址</span>
            <input
              className={styles.actionInput}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://github.com"
            />
          </label>

          <label className={styles.actionLabel}>
            <span>背景颜色</span>
            <input
              className={styles.actionColor}
              type="color"
              value={bgColor}
              onChange={(event) => setBgColor(event.target.value)}
            />
          </label>

          {folderIcons.length > 0 ? (
            <div className={styles.actionLabel}>
              <span>选择图标</span>
              <div className={styles.actionGrid}>
                {folderIcons.slice(0, 24).map((item) => (
                  <button
                    key={item.src}
                    className={
                      icon === item.src
                        ? `${styles.actionIcon} ${styles.actionIconActive}`
                        : styles.actionIcon
                    }
                    type="button"
                    title={item.name}
                    onClick={() => setIcon(item.src)}
                  >
                    <img src={item.src} alt={item.name} />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className={styles.actionFooter}>
          <button className={styles.actionSecondary} type="button" onClick={onClose}>
            取消
          </button>
          <button className={styles.actionPrimary} type="button" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "保存中..." : "保存标签"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function BackgroundDialog({
  open,
  currentBackground,
  onClose,
  onApply
}: BackgroundDialogProps) {
  const [gallery, setGallery] = useState<CardImageItem[]>([]);
  const [customUrl, setCustomUrl] = useState(currentBackground);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    setCustomUrl(currentBackground);
    requestLegacy<CardImageItem[]>("/api/cardImages")
      .then((response) => {
        setGallery(response.data);
      })
      .catch(() => {
        setGallery([]);
      });
  }, [open, currentBackground]);

  async function applyBackground(url: string) {
    if (saving) {
      return;
    }

    const normalized = normalizeUrl(url) || "/static/background.jpeg";
    setSaving(true);
    try {
      await onApply(normalized);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return null;
  }

  return (
    <div className={styles.actionBackdrop} onClick={onClose}>
      <div className={styles.actionDialogWide} onClick={(event) => event.stopPropagation()}>
        <div className={styles.actionHeader}>
          <div>
            <p className={styles.actionEyebrow}>快捷操作</p>
            <h2 className={styles.actionTitle}>切换壁纸</h2>
          </div>
          <button className={styles.actionClose} type="button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className={styles.actionForm}>
          <label className={styles.actionLabel}>
            <span>自定义壁纸地址</span>
            <div className={styles.actionInline}>
              <input
                className={styles.actionInput}
                value={customUrl}
                onChange={(event) => setCustomUrl(event.target.value)}
                placeholder="https://example.com/background.jpg"
              />
              <button className={styles.actionPrimary} type="button" onClick={() => applyBackground(customUrl)} disabled={saving}>
                应用
              </button>
            </div>
          </label>

          <div className={styles.actionLabel}>
            <span>内置背景库</span>
            <div className={styles.actionGallery}>
              <button
                className={
                  currentBackground === "/static/background.jpeg"
                    ? `${styles.actionGalleryItem} ${styles.actionGalleryItemActive}`
                    : styles.actionGalleryItem
                }
                type="button"
                onClick={() => applyBackground("/static/background.jpeg")}
              >
                <img src="/static/background.jpeg" alt="默认背景" />
              </button>
              {gallery.map((item) => (
                <button
                  key={item.url}
                  className={
                    currentBackground === item.url
                      ? `${styles.actionGalleryItem} ${styles.actionGalleryItemActive}`
                      : styles.actionGalleryItem
                  }
                  type="button"
                  onClick={() => applyBackground(item.url)}
                >
                  <img src={item.thumbor || item.url} alt="" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function buildActionLink(base: Partial<HomeLink> & Pick<HomeLink, "id" | "name" | "src" | "url">): HomeLink {
  return {
    id: base.id,
    app: base.app ?? 0,
    pid: base.pid ?? null,
    src: base.src,
    url: base.url,
    name: base.name,
    size: base.size ?? "1x1",
    sort: base.sort ?? 0,
    type: base.type ?? "icon",
    bgColor: base.bgColor ?? "rgba(255, 255, 255, 1)",
    pageGroup: base.pageGroup ?? "",
    form: base.form ?? "link",
    component: base.component ?? null,
    tips: base.tips ?? "",
    custom: base.custom ?? null,
    originId: base.originId ?? null
  };
}
