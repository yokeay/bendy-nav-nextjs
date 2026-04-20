"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./recommendations.module.css";

interface Props {
  bookmarkId: string;
  initialIsRecommended: boolean;
  initialRecommendTitle: string;
  initialRecommendDesc: string;
  initialRecommendSort: number;
  initialIsPublic: boolean;
}

export function RecommendationActions({
  bookmarkId,
  initialIsRecommended,
  initialRecommendTitle,
  initialRecommendDesc,
  initialRecommendSort,
  initialIsPublic
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isRecommended, setIsRecommended] = useState(initialIsRecommended);
  const [recommendTitle, setRecommendTitle] = useState(initialRecommendTitle);
  const [recommendDesc, setRecommendDesc] = useState(initialRecommendDesc);
  const [recommendSort, setRecommendSort] = useState(String(initialRecommendSort));
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [error, setError] = useState("");

  async function handleToggle() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/recommendations/${bookmarkId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isRecommended: !isRecommended })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || body?.code !== 0) {
        setError(body?.message || "操作失败");
        return;
      }
      setIsRecommended((prev) => !prev);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const sortValue = Number(recommendSort);
      const res = await fetch(`/api/admin/recommendations/${bookmarkId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          recommendTitle: recommendTitle.trim() || null,
          recommendDesc: recommendDesc.trim() || null,
          recommendSort: Number.isFinite(sortValue) ? sortValue : 0,
          isPublic
        })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || body?.code !== 0) {
        setError(body?.message || "操作失败");
        return;
      }
      setEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className={styles.actionRow}>
        <button
          type="button"
          className={isRecommended ? styles.btnPrimary : styles.btnGhost}
          onClick={() => void handleToggle()}
          disabled={saving}
        >
          {isRecommended ? "取消推荐" : "推荐"}
        </button>
        <button type="button" className={styles.btnGhost} onClick={() => setEditing(true)}>
          编辑
        </button>
      </div>
    );
  }

  return (
    <div className={styles.editor}>
      <label className={styles.editorField}>
        <span>推荐标题</span>
        <input
          type="text"
          value={recommendTitle}
          onChange={(e) => setRecommendTitle(e.target.value)}
          placeholder="为空时使用原标题"
        />
      </label>
      <label className={styles.editorField}>
        <span>推荐描述</span>
        <input
          type="text"
          value={recommendDesc}
          onChange={(e) => setRecommendDesc(e.target.value)}
          placeholder="为空时使用原摘要"
        />
      </label>
      <label className={styles.editorField}>
        <span>排序</span>
        <input
          type="number"
          value={recommendSort}
          onChange={(e) => setRecommendSort(e.target.value)}
        />
      </label>
      <label className={styles.editorInline}>
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
        />
        <span>公开可见</span>
      </label>
      {error ? <div className={styles.errorText}>{error}</div> : null}
      <div className={styles.actionRow}>
        <button type="button" className={styles.btnPrimary} onClick={() => void handleSave()} disabled={saving}>
          保存
        </button>
        <button type="button" className={styles.btnGhost} onClick={() => setEditing(false)} disabled={saving}>
          取消
        </button>
      </div>
    </div>
  );
}
