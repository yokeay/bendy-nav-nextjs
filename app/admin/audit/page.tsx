import { getRecentAudits } from "@/server/admin/dashboard/service";
import rootStyles from "../admin.module.css";
import styles from "../dashboard.module.css";

export const dynamic = "force-dynamic";

export default async function AuditLogPage() {
  const items = await getRecentAudits(200);
  return (
    <div className={rootStyles.content}>
      <h1 className={rootStyles.pageTitle}>审计日志</h1>
      <p className={rootStyles.pageHint}>显示最近 200 条审计记录。筛选与导出将在后续迭代加入。</p>

      <div className={styles.auditTable}>
        <table className={styles.auditTableInner}>
          <thead>
            <tr>
              <th>时间</th>
              <th>操作</th>
              <th>操作者</th>
              <th>目标</th>
              <th>IP</th>
              <th>Payload</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id}>
                <td>{a.createdAt.toISOString().replace("T", " ").slice(0, 19)}</td>
                <td><span className={styles.auditAction}>{a.action}</span></td>
                <td>{a.actor?.login ?? "—"}</td>
                <td>{a.targetType ? `${a.targetType}#${(a.targetId ?? "").slice(0, 8)}` : "—"}</td>
                <td>{a.ip ?? "—"}</td>
                <td className={styles.auditPayload}>{a.payload ? JSON.stringify(a.payload) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
