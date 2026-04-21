import { listSnapshots, isBackupEnabled } from "@/server/admin/settings/backup";
import { BackupTrigger } from "./trigger";
import styles from "../settings.module.css";
import rootStyles from "../../admin.module.css";

export const dynamic = "force-dynamic";

export default async function BackupPage() {
  let snapshots: Awaited<ReturnType<typeof listSnapshots>> = [];
  let enabled: boolean = false;
  let dbError = "";

  try {
    snapshots = await listSnapshots();
    enabled = isBackupEnabled();
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className={rootStyles.content}>
      <div className={styles.backupHeader}>
        <h1 className={rootStyles.pageTitle}>备份与恢复</h1>
        <BackupTrigger />
      </div>
      <p className={rootStyles.pageHint}>
        系统每日 18:00 自动备份核心数据为 JSON 快照并写入对象存储。也可手动触发即时备份，仅 superadmin 可操作。
        {enabled ? " 自动备份已启用。" : " 自动备份未启用（BACKUP_ENABLED=false）。"}
      </p>

      {dbError ? (
        <div style={{ color: "#c41d25", padding: "20px 0" }}>
          数据加载失败：{dbError}。请确认数据库迁移已执行（<code>npx prisma db push</code>）。
        </div>
      ) : (
        <>
      {snapshots.length === 0 ? (
        <div className={styles.snapshotItem} style={{ justifyContent: "center", color: "#8790a3" }}>
          还没有任何快照
        </div>
      ) : (
        <div className={styles.snapshotList}>
          {snapshots.map((s) => (
            <div key={s.id} className={styles.snapshotItem}>
              <div>
                <div className={styles.snapshotTitle}>{s.id}</div>
                <div className={styles.snapshotMeta}>
                  {Object.entries(s.counts)
                    .map(([k, v]) => `${k} ${v}`)
                    .join(" · ")}{" "}
                  · {(s.sizeBytes / 1024).toFixed(1)} KB
                </div>
              </div>
              <a className={styles.snapshotLink} href={s.url} target="_blank" rel="noreferrer">下载</a>
            </div>
          ))}
        </div>
      )}
        </>
      )}

      <div className={styles.backupNote}>
        恢复（restore）暂未实现，后续版本加入。当前快照可以手动下载后作为灾备依据。
      </div>
    </div>
  );
}
