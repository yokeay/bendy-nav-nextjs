import { getSiteConfig } from "@/server/admin/settings/service";
import { SettingsForm } from "./settings-form";
import styles from "./settings.module.css";
import rootStyles from "../admin.module.css";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const site = await getSiteConfig();

  return (
    <div className={rootStyles.content}>
      <h1 className={rootStyles.pageTitle}>系统设置</h1>
      <p className={rootStyles.pageHint}>修改站点信息与维护模式。保存前需要在 5 分钟内完成一次 GitHub 重新授权（re-auth）。</p>

      <SettingsForm initial={site} />

      <div className={styles.linksRow}>
        <a className={styles.linkCard} href="/admin/settings/backup">
          <div className={styles.linkCardTitle}>备份与恢复</div>
          <div className={styles.linkCardHint}>手动触发数据快照</div>
        </a>
      </div>
    </div>
  );
}
