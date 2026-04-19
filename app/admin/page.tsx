import { getDashboardMetrics, getRegistrationSeries, getRecentAudits } from "@/server/admin/dashboard/service";
import styles from "./admin.module.css";
import dashStyles from "./dashboard.module.css";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [metrics, series, audits] = await Promise.all([
    getDashboardMetrics(),
    getRegistrationSeries(30),
    getRecentAudits(20)
  ]);

  const max = Math.max(1, ...series.map((p) => p.count));

  return (
    <div className={styles.content}>
      <h1 className={styles.pageTitle}>概览</h1>
      <div className={dashStyles.metricGrid}>
        <MetricCard label="用户总数" value={metrics.totalUsers} />
        <MetricCard label="活跃用户" value={metrics.activeUsers} />
        <MetricCard label="今日新增" value={metrics.newUsersToday} accent />
        <MetricCard label="在线会话" value={metrics.activeSessions} />
        <MetricCard label="书签总数" value={metrics.totalLinks} />
        <MetricCard label="壁纸数量" value={metrics.totalWallpapers} />
        <MetricCard label="模板版本" value={metrics.totalTemplates} />
      </div>

      <div className={dashStyles.chartCard}>
        <div className={dashStyles.chartHeader}>
          <span>近 30 天注册趋势</span>
          <span className={dashStyles.chartAxis}>0 – {max}</span>
        </div>
        <div className={dashStyles.chartBody}>
          {series.map((point) => (
            <div
              key={point.date}
              className={dashStyles.bar}
              style={{ height: `${(point.count / max) * 100}%` }}
              title={`${point.date}: ${point.count}`}
            />
          ))}
        </div>
        <div className={dashStyles.chartFooter}>
          <span>{series[0]?.date}</span>
          <span>{series[series.length - 1]?.date}</span>
        </div>
      </div>

      <div className={dashStyles.sectionTitle}>最近审计</div>
      <div className={dashStyles.auditList}>
        {audits.length === 0 ? (
          <div className={dashStyles.auditEmpty}>暂无审计记录</div>
        ) : (
          audits.map((a) => (
            <div key={a.id} className={dashStyles.auditRow}>
              <span className={dashStyles.auditAction}>{a.action}</span>
              <span className={dashStyles.auditActor}>{a.actor?.login ?? "system"}</span>
              <span className={dashStyles.auditTarget}>{a.targetType ?? "-"} {a.targetId ? `#${a.targetId.slice(0, 8)}` : ""}</span>
              <span className={dashStyles.auditDate}>{a.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
            </div>
          ))
        )}
        <a className={dashStyles.auditMore} href="/admin/audit">查看全部审计日志 →</a>
      </div>
    </div>
  );
}

function MetricCard({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className={accent ? `${dashStyles.card} ${dashStyles.cardAccent}` : dashStyles.card}>
      <span className={dashStyles.cardLabel}>{label}</span>
      <span className={dashStyles.cardValue}>{value}</span>
    </div>
  );
}
