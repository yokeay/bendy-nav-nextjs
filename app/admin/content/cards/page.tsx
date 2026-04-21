import Link from "next/link";
import { listSubmissions } from "@/server/cards/submission-service";
import styles from "./cards.module.css";
import usersStyles from "../../users/users.module.css";
import rootStyles from "../../admin.module.css";
import { CardReviewActions } from "./card-review-actions";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readString(params: Record<string, string | string[] | undefined>, key: string): string {
  const v = params[key];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "全部状态" },
  { value: "submitted", label: "待审核" },
  { value: "reviewing", label: "需修改" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已驳回" },
  { value: "deprecated", label: "已下架" },
  { value: "draft", label: "草稿" }
];

export default async function AdminCardsPage({ searchParams }: Props) {
  const params = await searchParams;
  const keyword = readString(params, "keyword");
  const status = readString(params, "status");
  const page = Math.max(1, Number(readString(params, "page")) || 1);

  const { items, total, pageSize } = await listSubmissions({
    keyword: keyword || undefined,
    status: status || undefined,
    page
  });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={rootStyles.content}>
      <h1 className={rootStyles.pageTitle}>卡片审核</h1>
      <p className={rootStyles.pageHint}>
        用户提交的卡片在此审核。管理员账户直接提交的卡片已自动通过（`auto-approve`）。
      </p>

      <form method="get" className={usersStyles.filterForm}>
        <input
          type="search"
          name="keyword"
          placeholder="搜索 slug / 名称 / 作者"
          defaultValue={keyword}
          className={usersStyles.filterInput}
        />
        <select name="status" defaultValue={status} className={usersStyles.filterSelect}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button type="submit" className={usersStyles.filterSubmit}>筛选</button>
      </form>

      <div className={usersStyles.tableWrap}>
        <table className={usersStyles.table}>
          <thead>
            <tr>
              <th>卡片</th>
              <th>宿主</th>
              <th>版本</th>
              <th>作者</th>
              <th>状态</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={7} className={usersStyles.empty}>暂无提交</td></tr>
            ) : null}
            {items.map((sub) => (
              <tr key={sub.id}>
                <td>
                  <div className={usersStyles.userCell}>
                    {sub.icon ? <img src={sub.icon} alt="" style={{ width: 32, height: 32, borderRadius: 6 }} /> : null}
                    <div>
                      <div>{sub.name}</div>
                      <div className={styles.metaCell}>{sub.slug}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <span className={styles.hostBadge}>{sub.host}</span>
                  {sub.entryUrl ? (
                    <a className={styles.previewLink} href={sub.entryUrl} target="_blank" rel="noreferrer">
                      预览
                    </a>
                  ) : null}
                </td>
                <td>{sub.version}</td>
                <td className={styles.metaCell}>{sub.authorName || sub.authorId.slice(0, 8)}</td>
                <td>
                  <span className={`${styles.statusCell} ${styles[sub.status] ?? ""}`}>
                    {STATUS_OPTIONS.find((o) => o.value === sub.status)?.label ?? sub.status}
                  </span>
                  {sub.rejectReason ? (
                    <div className={styles.rejectReason}>{sub.rejectReason}</div>
                  ) : null}
                </td>
                <td className={styles.metaCell}>
                  {new Date(sub.updatedAt).toLocaleString("zh-CN", { hour12: false })}
                </td>
                <td>
                  <CardReviewActions
                    submissionId={sub.id}
                    initialStatus={sub.status}
                    host={sub.host}
                    entryUrl={sub.entryUrl}
                    currentVersion={sub.version}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={usersStyles.pagination}>
        <span>共 {total} 条</span>
        {page > 1 ? (
          <Link href={buildPageUrl(params, page - 1)} className={usersStyles.pageBtn}>
            上一页
          </Link>
        ) : null}
        <span>{page} / {totalPages}</span>
        {page < totalPages ? (
          <Link href={buildPageUrl(params, page + 1)} className={usersStyles.pageBtn}>
            下一页
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function buildPageUrl(params: Record<string, string | string[] | undefined>, page: number): string {
  const q = new URLSearchParams();
  for (const key of ["keyword", "status"]) {
    const v = readString(params, key);
    if (v) q.set(key, v);
  }
  q.set("page", String(page));
  return `?${q.toString()}`;
}
