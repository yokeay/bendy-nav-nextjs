"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./wallpapers.module.css";

interface Props {
  id: string;
  url: string;
  category: string;
  sort: number;
  createdAt: string;
}

export function WallpaperItem({ id, url, category, sort, createdAt }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draftCategory, setDraftCategory] = useState(category);
  const [draftSort, setDraftSort] = useState(sort);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    try {
      await fetch(`/api/admin/wallpapers/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category: draftCategory, sort: draftSort })
      });
      setEditing(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!confirm("删除这张壁纸？对象存储文件也会一并删除。")) return;
    setPending(true);
    try {
      await fetch(`/api/admin/wallpapers/${id}`, { method: "DELETE" });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.card}>
      <img src={url} alt="" className={styles.thumb} />
      {editing ? (
        <div className={styles.cardBody}>
          <input
            type="text"
            value={draftCategory}
            onChange={(e) => setDraftCategory(e.target.value)}
            className={styles.input}
          />
          <input
            type="number"
            value={draftSort}
            onChange={(e) => setDraftSort(Number(e.target.value))}
            className={styles.input}
          />
          <div className={styles.cardActions}>
            <button type="button" className={styles.smallBtn} onClick={save} disabled={pending}>保存</button>
            <button type="button" className={styles.smallBtn} onClick={() => setEditing(false)} disabled={pending}>取消</button>
          </div>
        </div>
      ) : (
        <div className={styles.cardBody}>
          <div className={styles.cardMeta}>
            <span>{category}</span>
            <span>#{sort}</span>
          </div>
          <div className={styles.cardDate}>{createdAt.slice(0, 10)}</div>
          <div className={styles.cardActions}>
            <button type="button" className={styles.smallBtn} onClick={() => setEditing(true)}>编辑</button>
            <button type="button" className={`${styles.smallBtn} ${styles.dangerBtn}`} onClick={remove} disabled={pending}>删除</button>
          </div>
        </div>
      )}
    </div>
  );
}
