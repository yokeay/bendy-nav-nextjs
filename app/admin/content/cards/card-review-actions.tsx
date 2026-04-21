"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./cards.module.css";

interface ScanHit {
  code: string;
  message: string;
  excerpt?: string;
}

interface Props {
  submissionId: string;
  initialStatus: string;
  host: string;
  entryUrl: string;
  currentVersion: string;
  scanBlockers: ScanHit[];
  scanWarnings: ScanHit[];
  hostedUrl: string;
}

type Mode = "idle" | "approve" | "reject" | "request_changes" | "deprecate";

export function CardReviewActions({
  submissionId,
  initialStatus,
  host,
  entryUrl,
  currentVersion,
  scanBlockers,
  scanWarnings,
  hostedUrl
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("idle");
  const [note, setNote] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [version, setVersion] = useState(currentVersion);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const canApprove = initialStatus === "submitted" || initialStatus === "reviewing";
  const canReject = canApprove;
  const canRequestChanges = canApprove;
  const canDeprecate = initialStatus === "approved";
  const hasBlockers = scanBlockers.length > 0;

  async function submit(action: "approve" | "reject" | "request_changes" | "deprecate") {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/cards/submissions/${submissionId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          note: note.trim() || null,
          rejectReason: rejectReason.trim() || null,
          version: action === "approve" ? version.trim() || null : null
        })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || body?.code !== 0) {
        setError(body?.message || "操作失败");
        return;
      }
      setMode("idle");
      setNote("");
      setRejectReason("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  if (mode === "idle") {
    return (
      <div className={styles.actionRow}>
        {canApprove ? (
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={() => setMode("approve")}
            disabled={hasBlockers}
            title={hasBlockers ? "静态扫描发现阻断项，不能直接通过" : undefined}
          >
            通过
          </button>
        ) : null}
        {canReject ? (
          <button type="button" className={styles.btnDanger} onClick={() => setMode("reject")}>
            驳回
          </button>
        ) : null}
        {canRequestChanges ? (
          <button type="button" className={styles.btnGhost} onClick={() => setMode("request_changes")}>
            要求修改
          </button>
        ) : null}
        {canDeprecate ? (
          <button type="button" className={styles.btnGhost} onClick={() => setMode("deprecate")}>
            下架
          </button>
        ) : null}
        {host === "iframe" && entryUrl ? (
          <a className={styles.previewLink} href={entryUrl} target="_blank" rel="noreferrer">
            打开预览
          </a>
        ) : null}
        {host === "inline" && hostedUrl ? (
          <a className={styles.previewLink} href={hostedUrl} target="_blank" rel="noreferrer">
            查看托管页
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.editor}>
      {mode === "approve" ? (
        <>
          <label className={styles.editorField}>
            <span>版本号（留空则自动 patch 自增）</span>
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder={currentVersion}
            />
          </label>
          <label className={styles.editorField}>
            <span>内部备注</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          {host === "inline" ? (
            <div className={styles.previewHint}>
              inline 卡片通过后会托管到 <code>/api/cards/host/&lt;slug&gt;/&lt;version&gt;/index.html</code>，首页以 iframe 宿主加载。
            </div>
          ) : null}
          {scanWarnings.length > 0 ? (
            <div className={styles.scanWarn}>
              {scanWarnings.map((hit) => (
                <div key={hit.code}>告警 · {hit.message}</div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}

      {mode === "reject" ? (
        <>
          <label className={styles.editorField}>
            <span>驳回原因（必填，对作者可见）</span>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} required />
          </label>
          <label className={styles.editorField}>
            <span>内部备注</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </>
      ) : null}

      {mode === "request_changes" ? (
        <label className={styles.editorField}>
          <span>修改建议（必填，对作者可见）</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} required />
        </label>
      ) : null}

      {mode === "deprecate" ? (
        <label className={styles.editorField}>
          <span>下架备注</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      ) : null}

      {error ? <div className={styles.errorText}>{error}</div> : null}

      <div className={styles.actionRow}>
        <button
          type="button"
          className={mode === "reject" ? styles.btnDanger : styles.btnPrimary}
          disabled={saving}
          onClick={() => void submit(mode as "approve" | "reject" | "request_changes" | "deprecate")}
        >
          {saving ? "处理中..." : mode === "approve" ? "确认通过" : mode === "reject" ? "确认驳回" : mode === "request_changes" ? "提交建议" : "确认下架"}
        </button>
        <button type="button" className={styles.btnGhost} disabled={saving} onClick={() => setMode("idle")}>
          取消
        </button>
      </div>
    </div>
  );
}
