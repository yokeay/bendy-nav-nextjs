"use client";

import { useEffect, useState } from "react";
import type { HomeLink } from "@/server/home/types";
import { requestLegacy } from "./home-client";
import styles from "./home-page.module.css";

type ClassFolderIcon = {
  src: string;
  name: string;
};

function usePageIcons(open: boolean) {
  const [icons, setIcons] = useState<ClassFolderIcon[]>([]);

  useEffect(() => {
    if (!open) return;
    requestLegacy<ClassFolderIcon[]>("/index/classFolderIcons")
      .then((response) => setIcons(response.data))
      .catch(() => setIcons([]));
  }, [open]);

  return icons;
}

type PageManagerPanelProps = {
  pages: HomeLink[];
  activePageId: string;
  homePageId: string;
  onSave: (payload: { id?: string; name: string; src: string; pageType: HomeLink["pageType"] }) => Promise<string | void>;
  onDelete: (pageId: string) => Promise<void>;
  onSelectPage: (pageId: string) => void;
  onMovePage: (pageId: string, direction: "up" | "down") => Promise<void>;
};

export function PageManagerPanel({
  pages,
  activePageId,
  homePageId,
  onSave,
  onDelete,
  onSelectPage,
  onMovePage
}: PageManagerPanelProps) {
  const pageIcons = usePageIcons(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [pageType, setPageType] = useState<HomeLink["pageType"]>("normal");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  const isHomeActive = activePageId === homePageId || (!activePageId && !homePageId);

  function beginCreate() {
    setEditingId(null);
    setName("");
    setIcon(pageIcons[0]?.src ?? "/icons/apps.svg");
    setPageType("normal");
    setModalOpen(true);
  }

  function beginEdit(page: HomeLink) {
    setEditingId(page.id);
    setName(page.name);
    setIcon(page.src);
    setPageType(page.pageType === "geek" ? "geek" : "normal");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingId(null);
    setName("");
    setIcon("");
    setPageType("normal");
  }

  async function handleSubmit() {
    if (saving || !name.trim() || !icon) return;
    setSaving(true);
    try {
      const savedPageId = await onSave({ id: editingId ?? undefined, name: name.trim(), src: icon, pageType });
      if (savedPageId) onSelectPage(savedPageId);
      closeModal();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(pageId: string) {
    if (deletingId) return;
    setDeletingId(pageId);
    try {
      await onDelete(pageId);
      if (activePageId === pageId) onSelectPage(homePageId);
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className={styles.pageManagerPanel}>
      <div className={styles.pageManagerHeader}>
        <span className={styles.pageManagerHeaderTitle}>页面列表</span>
        <button className={styles.pageManagerCreateBtn} type="button" onClick={beginCreate}>
          + 新建页面
        </button>
      </div>

      <div className={styles.pageManagerList}>
        <div className={isHomeActive ? `${styles.pageManagerItem} ${styles.pageManagerItemActive}` : styles.pageManagerItem}>
          <div className={styles.pageManagerMeta}>
            <img
              src={pageIcons[0]?.src || "/icons/apps.svg"}
              alt="首页"
              className={styles.pageManagerIcon}
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/icons/apps.svg"; }}
            />
            <span className={styles.pageManagerName}>首页</span>
          </div>
          <div className={styles.pageManagerActions}>
            <button className={styles.pageManagerAction} type="button" disabled>↑</button>
            <button className={styles.pageManagerAction} type="button" disabled>↓</button>
            <button className={`${styles.pageManagerAction} ${styles.pageManagerActionText}`} type="button" onClick={() => onSelectPage(homePageId)}>打开</button>
            <span className={styles.pageManagerBadge}>默认</span>
          </div>
        </div>

        {pages.map((page) => {
          const isActive = activePageId === page.id;
          return (
            <div key={page.id} className={isActive ? `${styles.pageManagerItem} ${styles.pageManagerItemActive}` : styles.pageManagerItem}>
              <div className={styles.pageManagerMeta}>
                <img
                  src={page.src || "/icons/apps.svg"}
                  alt={page.name}
                  className={styles.pageManagerIcon}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = "/icons/apps.svg"; }}
                />
                <span className={styles.pageManagerName}>{page.name}</span>
                {page.pageType === "geek" && <span className={styles.pageManagerBadge}>极客</span>}
              </div>
              <div className={styles.pageManagerActions}>
                <button className={styles.pageManagerAction} type="button" onClick={() => void onMovePage(page.id, "up")}>↑</button>
                <button className={styles.pageManagerAction} type="button" onClick={() => void onMovePage(page.id, "down")}>↓</button>
                <button className={`${styles.pageManagerAction} ${styles.pageManagerActionText}`} type="button" onClick={() => beginEdit(page)}>编辑</button>
                <button
                  className={`${styles.pageManagerAction} ${styles.pageManagerActionDanger}`}
                  type="button"
                  onClick={() => handleDelete(page.id)}
                  disabled={deletingId === page.id}
                >
                  {deletingId === page.id ? "..." : "删除"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {modalOpen && (
        <div className={styles.pageManagerModalOverlay} onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className={styles.pageManagerModal}>
            <div className={styles.pageManagerEditorHeader}>
              <span>{editingId ? "编辑页面" : "新建页面"}</span>
              <button className={styles.pageManagerEditorClose} type="button" onClick={closeModal} aria-label="关闭">×</button>
            </div>
            <div className={styles.pageManagerEditorForm}>
              <label className={styles.pageManagerField}>
                <span className={styles.pageManagerFieldTitle}>名称</span>
                <input
                  className={styles.pageManagerInput}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：工作"
                  autoFocus
                />
              </label>
              <div className={styles.pageManagerField}>
                <span className={styles.pageManagerFieldTitle}>图标</span>
                <div className={styles.pageManagerIconGrid}>
                  {pageIcons.slice(0, 24).map((item) => (
                    <button
                      key={item.src}
                      type="button"
                      title={item.name}
                      onClick={() => setIcon(item.src)}
                      className={icon === item.src ? `${styles.pageManagerIconBtn} ${styles.pageManagerIconBtnActive}` : styles.pageManagerIconBtn}
                    >
                      <img src={item.src} alt={item.name} />
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.pageManagerField}>
                <span className={styles.pageManagerFieldTitle}>风格</span>
                <div className={styles.pageManagerTypeGrid}>
                  <button
                    type="button"
                    onClick={() => setPageType("normal")}
                    className={pageType === "normal" ? `${styles.pageManagerTypeBtn} ${styles.pageManagerTypeBtnActive}` : styles.pageManagerTypeBtn}
                  >
                    常规
                  </button>
                  <button
                    type="button"
                    onClick={() => setPageType("geek")}
                    className={pageType === "geek" ? `${styles.pageManagerTypeBtn} ${styles.pageManagerTypeBtnActive}` : styles.pageManagerTypeBtn}
                  >
                    极客
                  </button>
                </div>
              </div>
              <div className={styles.pageManagerModalActions}>
                <button className={styles.pageManagerCancelBtn} type="button" onClick={closeModal}>取消</button>
                <button
                  className={styles.pageManagerSubmit}
                  type="button"
                  onClick={handleSubmit}
                  disabled={saving || !name.trim()}
                >
                  {saving ? "..." : editingId ? "保存页面" : "创建页面"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
