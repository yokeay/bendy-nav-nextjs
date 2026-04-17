import Link from "next/link";
import { listUsers } from "@/server/admin/users/service";
import type { Role, UserStatus } from "@prisma/client";
import styles from "./users.module.css";
import rootStyles from "../admin.module.css";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readString(params: Record<string, string | string[] | undefined>, key: string): string {
  const v = params[key];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function UsersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const keyword = readString(params, "keyword");
  const role = readString(params, "role") as Role | "";
  const status = readString(params, "status") as UserStatus | "";
  const page = Math.max(1, Number(readString(params, "page")) || 1);

  const { items, total, pageSize } = await listUsers({
    keyword: keyword || undefined,
    role: role || undefined,
    status: status || undefined,
    page
  });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={rootStyles.content}>
      <div className={styles.headerRow}>
        <h1 className={rootStyles.pageTitle}>用户管理</h1>
        <a className={styles.exportBtn} href="/api/admin/users/export.csv">导出 CSV</a>
      </div>

      <form method="get" className={styles.filterForm}>
        <input
          type="search"
          name="keyword"
          defaultValue={keyword}
          placeholder="搜索 login / email / name"
          className={styles.filterInput}
        />
        <select name="role" defaultValue={role} className={styles.filterSelect}>
          <option value="">全部角色</option>
          <option value="user">user</option>
          <option value="admin">admin</option>
          <option value="superadmin">superadmin</option>
        </select>
        <select name="status" defaultValue={status} className={styles.filterSelect}>
          <option value="">全部状态</option>
          <option value="active">active</option>
          <option value="disabled">disabled</option>
        </select>
        <button type="submit" className={styles.filterSubmit}>筛选</button>
      </form>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>用户</th>
              <th>GitHub</th>
              <th>角色</th>
              <th>状态</th>
              <th>注册时间</th>
              <th>最近登录</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className={styles.empty}>没有符合条件的用户</td>
              </tr>
            ) : null}
            {items.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className={styles.userCell}>
                    {u.avatarUrl ? <img src={u.avatarUrl} alt="" className={styles.avatar} /> : null}
                    <div>
                      <div className={styles.userLogin}>{u.login}</div>
                      <div className={styles.userEmail}>{u.email}</div>
                    </div>
                  </div>
                </td>
                <td>{u.githubId}</td>
                <td><span className={styles[`role_${u.role}`] ?? styles.roleDefault}>{u.role}</span></td>
                <td><span className={u.status === "active" ? styles.statusOk : styles.statusBad}>{u.status}</span></td>
                <td className={styles.dateCell}>{u.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                <td className={styles.dateCell}>{u.lastLoginAt ? u.lastLoginAt.toISOString().slice(0, 16).replace("T", " ") : "—"}</td>
                <td><Link className={styles.detailLink} href={`/admin/users/${u.id}`}>详情</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.pagination}>
        <span>共 {total} 条</span>
        {page > 1 ? (
          <a href={buildPageUrl(params, page - 1)} className={styles.pageBtn}>上一页</a>
        ) : null}
        <span className={styles.pageText}>{page} / {totalPages}</span>
        {page < totalPages ? (
          <a href={buildPageUrl(params, page + 1)} className={styles.pageBtn}>下一页</a>
        ) : null}
      </div>
    </div>
  );
}

function buildPageUrl(params: Record<string, string | string[] | undefined>, page: number): string {
  const q = new URLSearchParams();
  for (const key of ["keyword", "role", "status"]) {
    const v = readString(params, key);
    if (v) q.set(key, v);
  }
  q.set("page", String(page));
  return `?${q.toString()}`;
}
