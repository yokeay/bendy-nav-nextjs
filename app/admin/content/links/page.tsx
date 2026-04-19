import { listContentLinks } from "@/server/admin/content/links/service";
import styles from "./links.module.css";
import usersStyles from "../../users/users.module.css";
import rootStyles from "../../admin.module.css";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readString(params: Record<string, string | string[] | undefined>, key: string): string {
  const v = params[key];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function ContentLinksPage({ searchParams }: Props) {
  const params = await searchParams;
  const userId = readString(params, "userId");
  const keyword = readString(params, "keyword");
  const page = Math.max(1, Number(readString(params, "page")) || 1);

  const { items, total, pageSize } = await listContentLinks({
    userId: userId || undefined,
    keyword: keyword || undefined,
    page
  });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={rootStyles.content}>
      <h1 className={rootStyles.pageTitle}>书签与页面</h1>
      <p className={rootStyles.pageHint}>全局只读视图。编辑与维护模式将在后续迭代接入。</p>

      <form method="get" className={usersStyles.filterForm}>
        <input
          type="text"
          name="userId"
          placeholder="用户 ID（可选）"
          defaultValue={userId}
          className={usersStyles.filterInput}
        />
        <input
          type="search"
          name="keyword"
          placeholder="搜索名称或 URL"
          defaultValue={keyword}
          className={usersStyles.filterInput}
        />
        <button type="submit" className={usersStyles.filterSubmit}>筛选</button>
      </form>

      <div className={usersStyles.tableWrap}>
        <table className={usersStyles.table}>
          <thead>
            <tr>
              <th>书签</th>
              <th>用户</th>
              <th>页面</th>
              <th>文件夹</th>
              <th>尺寸</th>
              <th>更新时间</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={6} className={usersStyles.empty}>暂无书签</td></tr>
            ) : null}
            {items.map((link) => (
              <tr key={link.id}>
                <td>
                  <div className={styles.linkCell}>
                    {link.icon ? <img src={link.icon} alt="" className={styles.linkIcon} /> : null}
                    <div>
                      <div className={usersStyles.userLogin}>{link.name}</div>
                      <div className={usersStyles.userEmail}>{link.url}</div>
                    </div>
                  </div>
                </td>
                <td>{link.user.login}</td>
                <td>{link.page?.name ?? "—"}</td>
                <td>{link.folder?.name ?? "—"}</td>
                <td>{link.size}</td>
                <td className={usersStyles.dateCell}>{link.updatedAt.toISOString().slice(0, 16).replace("T", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={usersStyles.pagination}>
        <span>共 {total} 条</span>
        {page > 1 ? <a href={`?userId=${encodeURIComponent(userId)}&keyword=${encodeURIComponent(keyword)}&page=${page - 1}`} className={usersStyles.pageBtn}>上一页</a> : null}
        <span>{page} / {totalPages}</span>
        {page < totalPages ? <a href={`?userId=${encodeURIComponent(userId)}&keyword=${encodeURIComponent(keyword)}&page=${page + 1}`} className={usersStyles.pageBtn}>下一页</a> : null}
      </div>
    </div>
  );
}
