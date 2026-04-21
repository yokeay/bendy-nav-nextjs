import { listRecommendations } from "@/server/admin/content/recommendations/service";
import styles from "./recommendations.module.css";
import usersStyles from "../../users/users.module.css";
import rootStyles from "../../admin.module.css";
import { RecommendationActions } from "./recommendation-actions";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readString(params: Record<string, string | string[] | undefined>, key: string): string {
  const v = params[key];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function RecommendationsPage({ searchParams }: Props) {
  const params = await searchParams;
  const keyword = readString(params, "keyword");
  const onlyRecommended = readString(params, "onlyRecommended") === "1";
  const page = Math.max(1, Number(readString(params, "page")) || 1);

  let items: Awaited<ReturnType<typeof listRecommendations>>["items"] = [];
  let total = 0;
  let pageSize = 30;
  let dbError = "";

  try {
    const result = await listRecommendations({
      keyword: keyword || undefined,
      onlyRecommended,
      page
    });
    items = result.items;
    total = result.total;
    pageSize = result.pageSize;
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={rootStyles.content}>
      <h1 className={rootStyles.pageTitle}>推荐中心</h1>
      {dbError ? (
        <div className={rootStyles.pageHint} style={{ color: "#c41d25" }}>
          数据加载失败：{dbError}。请确认数据库迁移已执行（<code>npx prisma db push</code>）。
        </div>
      ) : (
        <>
          <p className={rootStyles.pageHint}>
            勾选&quot;推荐&quot;后，该标签将出现在所有用户 C 端&quot;添加标签&quot;弹窗的推荐标签 Tab 中。
          </p>

      <form method="get" className={usersStyles.filterForm}>
        <input
          type="search"
          name="keyword"
          placeholder="搜索标题 / URL / 推荐名"
          defaultValue={keyword}
          className={usersStyles.filterInput}
        />
        <label className={styles.filterCheck}>
          <input
            type="checkbox"
            name="onlyRecommended"
            value="1"
            defaultChecked={onlyRecommended}
          />
          仅看推荐中
        </label>
        <button type="submit" className={usersStyles.filterSubmit}>筛选</button>
      </form>

      <div className={usersStyles.tableWrap}>
        <table className={usersStyles.table}>
          <thead>
            <tr>
              <th>书签</th>
              <th>标签</th>
              <th>推荐标题</th>
              <th>推荐描述</th>
              <th>排序</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan={7} className={usersStyles.empty}>暂无书签</td></tr>
            ) : null}
            {items.map((bm) => (
              <tr key={bm.id}>
                <td>
                  <div className={styles.linkCell}>
                    {bm.iconUrl ? <img src={bm.iconUrl} alt="" className={styles.linkIcon} /> : null}
                    <div>
                      <div className={usersStyles.userLogin}>{bm.title}</div>
                      <div className={usersStyles.userEmail}>{bm.url}</div>
                    </div>
                  </div>
                </td>
                <td className={styles.tagsCell}>{bm.tags || "—"}</td>
                <td className={styles.textCell}>{bm.recommendTitle || "—"}</td>
                <td className={styles.textCell}>{bm.recommendDesc || "—"}</td>
                <td>{bm.recommendSort}</td>
                <td>
                  <span className={bm.isRecommended ? styles.statusOk : styles.statusOff}>
                    {bm.isRecommended ? "推荐中" : "未推荐"}
                  </span>
                </td>
                <td>
                  <RecommendationActions
                    bookmarkId={bm.id}
                    initialIsRecommended={bm.isRecommended}
                    initialRecommendTitle={bm.recommendTitle ?? ""}
                    initialRecommendDesc={bm.recommendDesc ?? ""}
                    initialRecommendSort={bm.recommendSort}
                    initialIsPublic={bm.isPublic}
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
          <a
            href={buildPageUrl(params, page - 1)}
            className={usersStyles.pageBtn}
          >
            上一页
          </a>
        ) : null}
        <span>{page} / {totalPages}</span>
        {page < totalPages ? (
          <a
            href={buildPageUrl(params, page + 1)}
            className={usersStyles.pageBtn}
          >
            下一页
          </a>
        ) : null}
      </div>
        </>
      )}
    </div>
  );
}

function buildPageUrl(params: Record<string, string | string[] | undefined>, page: number): string {
  const q = new URLSearchParams();
  for (const key of ["keyword", "onlyRecommended"]) {
    const v = readString(params, key);
    if (v) q.set(key, v);
  }
  q.set("page", String(page));
  return `?${q.toString()}`;
}
