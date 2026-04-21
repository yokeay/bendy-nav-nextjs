import Link from "next/link";
import { redirect } from "next/navigation";
import { readSession } from "@/server/auth/middleware";
import { listSubmissions } from "@/server/cards/submission-service";
import styles from "../cards.module.css";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readString(params: Record<string, string | string[] | undefined>, key: string): string {
  const v = params[key];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function MyCardsPage({ searchParams }: Props) {
  const session = await readSession().catch(() => null);
  if (!session) redirect("/");
  const params = await searchParams;
  const page = Math.max(1, Number(readString(params, "page")) || 1);

  let items: Awaited<ReturnType<typeof listSubmissions>>["items"] = [];
  let total = 0;
  let pageSize = 30;
  let dbError = "";

  try {
    const result = await listSubmissions({
      authorId: session.sub,
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
    <>
      <h1 className={styles.pageTitle}>我的提交</h1>
      {dbError ? (
        <div style={{ color: "#c41d25", padding: 20 }}>
          数据加载失败：{dbError}。请确认数据库迁移已执行（<code>npx prisma db push</code>）。
        </div>
      ) : (
        <>
          <p className={styles.pageHint}>共 {total} 条提交 · 第 {page} / {totalPages} 页</p>

      {items.length === 0 ? (
        <div className={styles.emptyState}>
          还没有提交记录。<Link href="/cards/new" className={styles.tableLink}>去提交第一个卡片 →</Link>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>卡片</th>
                <th>宿主</th>
                <th>版本</th>
                <th>状态</th>
                <th>更新时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((sub) => (
                <tr key={sub.id}>
                  <td>
                    <div>{sub.name}</div>
                    <div style={{ fontSize: 12, color: "#5b6378" }}>{sub.slug}</div>
                  </td>
                  <td>{sub.host}</td>
                  <td>{sub.version}</td>
                  <td>
                    <span className={styles.statusChip} data-status={sub.status}>{sub.status}</span>
                    {sub.rejectReason ? (
                      <div style={{ fontSize: 11, color: "#c41d25", marginTop: 4 }}>{sub.rejectReason}</div>
                    ) : null}
                  </td>
                  <td style={{ fontSize: 12, color: "#5b6378" }}>
                    {new Date(sub.updatedAt).toLocaleString("zh-CN", { hour12: false })}
                  </td>
                  <td>
                    {["draft", "submitted", "reviewing", "rejected"].includes(sub.status) ? (
                      <Link href={`/cards/${sub.id}/edit`} className={styles.tableLink}>
                        编辑
                      </Link>
                    ) : (
                      <span style={{ color: "#8790a3", fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
        </>
      )}
    </>
  );
}
