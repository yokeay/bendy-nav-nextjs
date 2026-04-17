"use client";

import { useEffect, useState } from "react";
import type { HomeLink } from "@/server/home/types";
import { requestLegacy } from "./home-client";
import styles from "./home-page.module.css";

type PageManagerDialogProps = {
  open: boolean;
  pages: HomeLink[];
  activePageId: string;
  homePageId: string;
  initialPageId?: string;
  onClose: () => void;
  onSave: (payload: { id?: string; name: string; src: string; pageType: HomeLink["pageType"] }) => Promise<string | void>;
  onDelete: (pageId: string) => Promise<void>;
  onSelectPage: (pageId: string) => void;
  onMovePage: (pageId: string, direction: "up" | "down") => Promise<void>;
};

type ClassFolderIcon = {
  src: string;
  name: string;
};

function usePageIcons(open: boolean) {
  const [icons, setIcons] = useState<ClassFolderIcon[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }

    requestLegacy<ClassFolderIcon[]>("/index/classFolderIcons")
      .then((response) => {
        setIcons(response.data);
      })
      .catch(() => {
        setIcons([]);
      });
  }, [open]);

  return icons;
}

export function PageManagerDialog({
  open,
  pages,
  activePageId,
  homePageId,
  initialPageId,
  onClose,
  onSave,
  onDelete,
  onSelectPage,
  onMovePage
}: PageManagerDialogProps) {
  const pageIcons = usePageIcons(open);
  const [editingId, setEditingId] = useState("");
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [pageType, setPageType] = useState<HomeLink["pageType"]>("normal");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  useEffect(() => {
    if (!open) {
      setEditingId("");
      setName("");
      setIcon("");
      setPageType("normal");
      setSaving(false);
      setDeletingId("");
    }
  }, [open]);

  useEffect(() => {
    if (!open || !initialPageId) {
      return;
    }

    const matchedPage = pages.find((page) => page.id === initialPageId);
    if (!matchedPage) {
      return;
    }

    setEditingId(matchedPage.id);
    setName(matchedPage.name);
    setIcon(matchedPage.src);
    setPageType(matchedPage.pageType === "geek" ? "geek" : "normal");
  }, [initialPageId, open, pages]);

  useEffect(() => {
    if (!open || initialPageId) {
      return;
    }

    setEditingId("");
    setName("");
    setIcon(pageIcons[0]?.src ?? "/static/pageGroup/home.svg");
    setPageType("normal");
  }, [initialPageId, open, pageIcons]);

  function beginCreate() {
    setEditingId("");
    setName("");
    setIcon(pageIcons[0]?.src ?? "/static/pageGroup/home.svg");
    setPageType("normal");
  }

  function beginEdit(page: HomeLink) {
    setEditingId(page.id);
    setName(page.name);
    setIcon(page.src);
    setPageType(page.pageType === "geek" ? "geek" : "normal");
  }

  function isHomeActive() {
    return activePageId === homePageId || (!activePageId && !homePageId);
  }

  function handleSelectPage(pageId: string) {
    onSelectPage(pageId);
    onClose();
  }

  async function handleSubmit() {
    if (saving || !name.trim() || !icon) {
      return;
    }

    setSaving(true);
    try {
      const savedPageId = await onSave({
        id: editingId || undefined,
        name: name.trim(),
        src: icon,
        pageType
      });

      if (savedPageId) {
        onSelectPage(savedPageId);
      }

      onClose();
      beginCreate();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(pageId: string) {
    if (deletingId) {
      return;
    }

    setDeletingId(pageId);
    try {
      await onDelete(pageId);
      if (activePageId === pageId) {
        onSelectPage(homePageId);
      }
      if (editingId === pageId) {
        beginCreate();
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
      <div className={styles.pageManagerDialog} onClick={(event) => event.stopPropagation()}>
        <div className={styles.actionHeader}>
          <div>
            <p className={styles.actionEyebrow}>桌面编辑</p>
            <h2 className={styles.actionTitle}>页面管理</h2>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className={styles.actionPrimary} type="button" onClick={beginCreate}>
              新建页面
            </button>
            <button className={styles.actionClose} type="button" onClick={onClose} aria-label="关闭">
              ×
            </button>
          </div>
        </div>

        <div className={styles.pageManagerShell}>
          <div className={styles.groupManagerList}>
            <div className={isHomeActive() ? `${styles.groupManagerItem} ${styles.groupManagerItemActive}` : styles.groupManagerItem}>
              <div className={styles.groupManagerMeta}>
                <img src="/static/pageGroup/home.svg" alt="首页" />
                <span>首页</span>
              </div>
                <div className={styles.groupManagerActions}>
                  <button className={styles.actionSecondary} type="button" disabled>
                    上移
                  </button>
                  <button className={styles.actionSecondary} type="button" disabled>
                    下移
                  </button>
                  <button className={styles.actionSecondary} type="button" onClick={() => handleSelectPage(homePageId)}>
                    打开
                  </button>
                <button className={styles.actionSecondary} type="button" disabled>
                  默认页
                </button>
              </div>
            </div>

            {pages.map((page) => (
              <div
                className={activePageId === page.id ? `${styles.groupManagerItem} ${styles.groupManagerItemActive}` : styles.groupManagerItem}
                key={page.id}
              >
                <div className={styles.groupManagerMeta}>
                  <img src={page.src} alt={page.name} />
                  <span>{page.name}</span>
                  <em>{page.pageType === "geek" ? "极客" : "常规"}</em>
                </div>
                <div className={styles.groupManagerActions}>
                  <button className={styles.actionSecondary} type="button" onClick={() => void onMovePage(page.id, "up")}>
                    上移
                  </button>
                  <button className={styles.actionSecondary} type="button" onClick={() => void onMovePage(page.id, "down")}>
                    下移
                  </button>
                  <button className={styles.actionSecondary} type="button" onClick={() => handleSelectPage(page.id)}>
                    打开
                  </button>
                  <button className={styles.actionSecondary} type="button" onClick={() => beginEdit(page)}>
                    编辑
                  </button>
                  <button
                    className={styles.actionDanger}
                    type="button"
                    onClick={() => handleDelete(page.id)}
                    disabled={deletingId === page.id}
                  >
                    {deletingId === page.id ? "删除中..." : "删除"}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.groupManagerEditor}>
            <div className={styles.actionLabel}>
              <span>页面名称</span>
              <input
                className={styles.actionInput}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：工作"
              />
            </div>

            {pageIcons.length > 0 ? (
              <div className={styles.actionLabel}>
                <span>页面图标</span>
                <div className={styles.actionGrid}>
                  {pageIcons.slice(0, 24).map((item) => (
                    <button
                      key={item.src}
                      className={icon === item.src ? `${styles.actionIcon} ${styles.actionIconActive}` : styles.actionIcon}
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

            <div className={styles.actionLabel}>
              <span>页面风格</span>
              <div className={styles.pageTypeGrid}>
                <button
                  className={pageType === "normal" ? `${styles.pageTypeCard} ${styles.pageTypeCardActive}` : styles.pageTypeCard}
                  type="button"
                  onClick={() => setPageType("normal")}
                >
                  <strong>常规</strong>
                  <small>适合日常导航、搜索和卡片组件</small>
                </button>
                <button
                  className={pageType === "geek" ? `${styles.pageTypeCard} ${styles.pageTypeCardActive}` : styles.pageTypeCard}
                  type="button"
                  onClick={() => setPageType("geek")}
                >
                  <strong>极客</strong>
                  <small>预留极客工作台风格，后续扩展专属内容</small>
                </button>
              </div>
            </div>

            <div className={styles.actionFooter}>
              {hasFormValue ? (
                <button className={styles.actionSecondary} type="button" onClick={beginCreate}>
                  清空
                </button>
              ) : null}
              <button className={styles.actionPrimary} type="button" onClick={handleSubmit} disabled={saving}>
                {saving ? "保存中..." : editingId ? "保存页面" : "创建页面"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
