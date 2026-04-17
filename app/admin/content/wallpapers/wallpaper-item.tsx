"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./wallpapers.module.css";

interface Props {
  id: string;
  name: string;
  url: string;
  hdUrl: string | null;
  description: string | null;
  colorMode: string;
  category: string;
  sort: number;
  createdAt: string;
}

export function WallpaperItem({
  id,
  name,
  url,
  hdUrl,
  description,
  colorMode,
  category,
  sort,
  createdAt
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [draftUrl, setDraftUrl] = useState(url);
  const [draftHdUrl, setDraftHdUrl] = useState(hdUrl ?? "");
  const [draftDescription, setDraftDescription] = useState(description ?? "");
  const [draftColorMode, setDraftColorMode] = useState<"day" | "night">(
    colorMode === "night" ? "night" : "day"
  );
  const [draftSort, setDraftSort] = useState(sort);
  const [pending, setPending] = useState(false);

  async function save() {
    setPending(true);
    try {
      await fetch(`/api/admin/wallpapers/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draftName,
          url: draftUrl,
          hdUrl: draftHdUrl,
          description: draftDescription,
          colorMode: draftColorMode,
          sort: draftSort
        })
      });
      setEditing(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!confirm("删除这张壁纸？")) return;
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
      <img src={url} alt={name} className={styles.thumb} />
      {editing ? (
        <div className={styles.cardBody}>
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="名称"
            className={styles.input}
          />
          <input
            type="url"
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
            placeholder="地址"
            className={styles.input}
          />
          <input
            type="url"
            value={draftHdUrl}
            onChange={(e) => setDraftHdUrl(e.target.value)}
            placeholder="高清地址"
            className={styles.input}
          />
          <textarea
            value={draftDescription}
            onChange={(e) => setDraftDescription(e.target.value)}
            placeholder="描述"
            className={styles.input}
            rows={2}
          />
          <div className={styles.segmentGroup}>
            <button
              type="button"
              className={draftColorMode === "day" ? styles.segmentActive : styles.segment}
              onClick={() => setDraftColorMode("day")}
            >
              白天
            </button>
            <button
              type="button"
              className={draftColorMode === "night" ? styles.segmentActive : styles.segment}
              onClick={() => setDraftColorMode("night")}
            >
              夜间
            </button>
          </div>
          <input
            type="number"
            value={draftSort}
            onChange={(e) => setDraftSort(Number(e.target.value))}
            placeholder="排序"
            className={styles.input}
          />
          <div className={styles.cardActions}>
            <button type="button" className={styles.smallBtn} onClick={save} disabled={pending}>保存</button>
            <button type="button" className={styles.smallBtn} onClick={() => setEditing(false)} disabled={pending}>取消</button>
          </div>
        </div>
      ) : (
        <div className={styles.cardBody}>
          <div className={styles.cardName}>{name || "(未命名)"}</div>
          <div className={styles.cardMeta}>
            <span className={colorMode === "night" ? styles.badgeNight : styles.badgeDay}>
              {colorMode === "night" ? "夜间" : "白天"}
            </span>
            <span>{category}</span>
            <span>#{sort}</span>
          </div>
          {description ? <div className={styles.cardDesc}>{description}</div> : null}
          <div className={styles.cardDate}>{createdAt.slice(0, 10)}</div>
          <div className={styles.cardActions}>
            <button type="button" className={styles.smallBtn} onClick={() => setEditing(true)}>编辑</button>
            {hdUrl ? (
              <a className={styles.smallBtn} href={hdUrl} target="_blank" rel="noreferrer">高清</a>
            ) : null}
            <button type="button" className={`${styles.smallBtn} ${styles.dangerBtn}`} onClick={remove} disabled={pending}>删除</button>
          </div>
        </div>
      )}
    </div>
  );
}
