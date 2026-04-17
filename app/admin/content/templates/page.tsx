import { listTemplates, getLatestTemplate } from "@/server/admin/content/templates/service";
import { TemplatePublisher } from "./publisher";
import styles from "./templates.module.css";
import rootStyles from "../../admin.module.css";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const [items, latest] = await Promise.all([listTemplates(), getLatestTemplate()]);

  return (
    <div className={rootStyles.content}>
      <h1 className={rootStyles.pageTitle}>默认首页模板</h1>
      <p className={rootStyles.pageHint}>
        新版导航默认首页的 JSON 模板。发布后，会成为新注册用户的初始首页数据。发布操作需 5 分钟内重新授权（re-auth）。
      </p>

      <TemplatePublisher initialJson={latest ? JSON.stringify(latest.content, null, 2) : "{\n  \n}"} />

      <h2 className={styles.subTitle}>历史版本</h2>
      {items.length === 0 ? (
        <div className={styles.empty}>还没有发布任何模板</div>
      ) : (
        <div className={styles.versionList}>
          {items.map((item) => (
            <div key={item.id} className={styles.versionCard}>
              <div className={styles.versionHeader}>
                <span className={styles.versionTag}>v{item.version}</span>
                <span className={styles.versionDate}>{item.publishedAt.toISOString()}</span>
              </div>
              {item.notes ? <p className={styles.versionNotes}>{item.notes}</p> : null}
              <details>
                <summary className={styles.versionSummary}>查看 JSON</summary>
                <pre className={styles.versionJson}>{JSON.stringify(item.content, null, 2)}</pre>
              </details>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
