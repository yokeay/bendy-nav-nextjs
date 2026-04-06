"use client";

import { useEffect, useState } from "react";
import type { HomeLink } from "@/server/home/types";
import { requestLegacy } from "./home-client";
import styles from "./home-page.module.css";

export { AddLinkDialog } from "./home-link-editor-dialog";

type ActionDialogProps = {
  open: boolean;
  onClose: () => void;
};

type BackgroundDialogProps = ActionDialogProps & {
  currentBackground: string;
  onApply: (backgroundUrl: string) => Promise<void>;
};

type PageGroupManagerDialogProps = ActionDialogProps & {
  pageGroups: HomeLink[];
  initialGroupId?: string;
  onSave: (payload: { id?: string; name: string; src: string }) => Promise<void>;
  onDelete: (groupId: string) => Promise<void>;
};

type ClassFolderIcon = {
  src: string;
  name: string;
};

type CardImageItem = {
  thumbor: string;
  url: string;
  name?: string;
  fileName?: string;
  isDefault?: boolean;
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

function resolvePageGroupLabel(group: HomeLink) {
  return group.name?.trim() || "首页";
}

function useFolderIcons(open: boolean) {
  const [folderIcons, setFolderIcons] = useState<ClassFolderIcon[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }

    requestLegacy<ClassFolderIcon[]>("/index/classFolderIcons")
      .then((response) => {
        setFolderIcons(Array.isArray(response.data) ? response.data : []);
      })
      .catch(() => {
        setFolderIcons([]);
      });
  }, [open]);

  return folderIcons;
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
        setGallery(Array.isArray(response.data) ? response.data : []);
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
              <button
                className={styles.actionPrimary}
                type="button"
                onClick={() => applyBackground(customUrl)}
                disabled={saving}
              >
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
                  title={item.name || item.fileName || "壁纸"}
                >
                  <img src={item.thumbor || item.url} alt="" />
                  <span className={styles.actionGalleryMeta}>
                    <span>{item.name || item.fileName || "壁纸"}</span>
                    {item.isDefault ? <strong>默认</strong> : null}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PageGroupManagerDialog({
  open,
  pageGroups,
  initialGroupId,
  onClose,
  onSave,
  onDelete
}: PageGroupManagerDialogProps) {
  const folderIcons = useFolderIcons(open);
  const [editingId, setEditingId] = useState("");
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  useEffect(() => {
    if (!open) {
      setEditingId("");
      setName("");
      setIcon("");
      setSaving(false);
      setDeletingId("");
    }
  }, [open]);

  useEffect(() => {
    if (!open || !initialGroupId) {
      return;
    }

    const matchedGroup = pageGroups.find((group) => group.id === initialGroupId);
    if (!matchedGroup) {
      return;
    }

    setEditingId(matchedGroup.id);
    setName(matchedGroup.name);
    setIcon(matchedGroup.src);
  }, [initialGroupId, open, pageGroups]);

  function beginCreate() {
    setEditingId("");
    setName("");
    setIcon(folderIcons[0]?.src ?? "/static/pageGroup/home.svg");
  }

  function beginEdit(group: HomeLink) {
    setEditingId(group.id);
    setName(group.name);
    setIcon(group.src);
  }

  async function handleSubmit() {
    if (saving || !name.trim() || !icon) {
      return;
    }

    setSaving(true);
    try {
      await onSave({
        id: editingId || undefined,
        name: name.trim(),
        src: icon
      });
      setEditingId("");
      setName("");
      setIcon(folderIcons[0]?.src ?? "/static/pageGroup/home.svg");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(groupId: string) {
    if (deletingId) {
      return;
    }

    setDeletingId(groupId);
    try {
      await onDelete(groupId);
      if (editingId === groupId) {
        setEditingId("");
        setName("");
        setIcon("");
      }
    } finally {
      setDeletingId("");
    }
  }

  const hasFormValue = name.trim().length > 0 || icon.length > 0 || editingId.length > 0;

  if (!open) {
    return null;
  }

  return (
    <div className={styles.actionBackdrop} onClick={onClose}>
      <div className={styles.actionDialogWide} onClick={(event) => event.stopPropagation()}>
        <div className={styles.actionHeader}>
          <div>
            <p className={styles.actionEyebrow}>桌面编辑</p>
            <h2 className={styles.actionTitle}>分组管理</h2>
          </div>
          <button className={styles.actionClose} type="button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className={styles.groupManagerLayout}>
          <div className={styles.groupManagerList}>
            <div className={styles.groupManagerToolbar}>
              <button className={styles.actionPrimary} type="button" onClick={beginCreate}>
                新建分组
              </button>
            </div>
            <div className={styles.groupManagerItem}>
              <div className={styles.groupManagerMeta}>
                <img src="/static/pageGroup/home.svg" alt="首页" />
                <span>首页</span>
              </div>
              <div className={styles.groupManagerActions}>
                <button className={styles.actionSecondary} type="button" disabled>
                  默认页
                </button>
              </div>
            </div>
            {pageGroups.map((group) => (
              <div className={styles.groupManagerItem} key={group.id}>
                <div className={styles.groupManagerMeta}>
                  <img src={group.src} alt={group.name} />
                  <span>{group.name}</span>
                </div>
                <div className={styles.groupManagerActions}>
                  <button className={styles.actionSecondary} type="button" onClick={() => beginEdit(group)}>
                    编辑
                  </button>
                  <button
                    className={styles.actionDanger}
                    type="button"
                    onClick={() => handleDelete(group.id)}
                    disabled={deletingId === group.id}
                  >
                    {deletingId === group.id ? "删除中..." : "删除"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.groupManagerEditor}>
            <div className={styles.actionLabel}>
              <span>分组名称</span>
              <input
                className={styles.actionInput}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：工作"
              />
            </div>

            {folderIcons.length > 0 ? (
              <div className={styles.actionLabel}>
                <span>分组图标</span>
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

            <div className={styles.actionFooter}>
              {hasFormValue ? (
                <button className={styles.actionSecondary} type="button" onClick={beginCreate}>
                  清空
                </button>
              ) : null}
              <button className={styles.actionPrimary} type="button" onClick={handleSubmit} disabled={saving}>
                {saving ? "保存中..." : editingId ? "保存分组" : "创建分组"}
              </button>
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
