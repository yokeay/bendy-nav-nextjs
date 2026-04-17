import styles from "./admin.module.css";

export default function AdminDashboardPage() {
  return (
    <div className={styles.content}>
      <h1 className={styles.pageTitle}>概览</h1>
      <p className={styles.pageHint}>
        指标卡将在 F7 阶段接入。当前仅作为后台壳层的占位页面。
      </p>
      <div className={styles.placeholderGrid}>
        <div className={styles.placeholderCard}>
          <span className={styles.placeholderLabel}>用户总数</span>
          <span className={styles.placeholderValue}>—</span>
        </div>
        <div className={styles.placeholderCard}>
          <span className={styles.placeholderLabel}>今日新增</span>
          <span className={styles.placeholderValue}>—</span>
        </div>
        <div className={styles.placeholderCard}>
          <span className={styles.placeholderLabel}>在线会话</span>
          <span className={styles.placeholderValue}>—</span>
        </div>
      </div>
    </div>
  );
}
