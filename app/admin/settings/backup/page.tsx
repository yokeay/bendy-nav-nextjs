import { listSnapshots, isBackupEnabled } from "@/server/admin/settings/backup";
import { BackupTrigger } from "./trigger";
import styles from "../settings.module.css";
import rootStyles from "../../admin.module.css";

export const dynamic = "force-dynamic";

export default async function BackupPage() {
  const snapshots = await listSnapshots();
  const enabled = isBackupEnabled();

  return (
    <div className={rootStyles.content}>
      <div className={styles.backupHeader}>
        <h1 className={rootStyles.pageTitle}>备份与恢复</h1>
        <BackupTrigger />
      </div>
      <p className={rootStyles.pageHint}>
        手动触发会导出核心数据为 JSON 快照并写入对象存储。仅 superadmin 可触发，需要通过 re-auth。
        {enabled ? " 计划任务模式已启用。" : " 计划任务未启用（BACKUP_ENABLED=false）。"}
      </p>

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

      <div className={styles.backupNote}>
        恢复（restore）暂未实现，后续版本加入。当前快照可以手动下载后作为灾备依据。
      </div>
    </div>
  );
}
