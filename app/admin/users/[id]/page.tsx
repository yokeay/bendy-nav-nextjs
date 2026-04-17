import { notFound } from "next/navigation";
import { getUser } from "@/server/admin/users/service";
import { UserActions } from "./user-actions";
import styles from "../users.module.css";
import rootStyles from "../../admin.module.css";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function UserDetailPage({ params }: Props) {
  const { id } = await params;
  const user = await getUser(id);
  if (!user) notFound();

  return (
    <div className={rootStyles.content}>
      <h1 className={rootStyles.pageTitle}>{user.login}</h1>
      <div className={styles.detailGrid}>
        <div className={styles.detailCard}>
          <div className={styles.detailHeader}>
            {user.avatarUrl ? <img src={user.avatarUrl} alt="" className={styles.detailAvatar} /> : null}
            <div>
              <div className={styles.userLogin}>{user.name || user.login}</div>
              <div className={styles.userEmail}>{user.email}</div>
            </div>
          </div>
          <div className={styles.detailFields}>
            <span className={styles.detailFieldKey}>ID</span>
            <span className={styles.detailFieldValue}>{user.id}</span>
            <span className={styles.detailFieldKey}>GitHub ID</span>
            <span className={styles.detailFieldValue}>{user.githubId}</span>
            <span className={styles.detailFieldKey}>角色</span>
            <span className={styles.detailFieldValue}>{user.role}</span>
            <span className={styles.detailFieldKey}>状态</span>
            <span className={styles.detailFieldValue}>{user.status}</span>
            <span className={styles.detailFieldKey}>注册</span>
            <span className={styles.detailFieldValue}>{user.createdAt.toISOString()}</span>
            <span className={styles.detailFieldKey}>最近登录</span>
            <span className={styles.detailFieldValue}>{user.lastLoginAt?.toISOString() ?? "—"}</span>
            <span className={styles.detailFieldKey}>书签数</span>
            <span className={styles.detailFieldValue}>{user._count.links}</span>
            <span className={styles.detailFieldKey}>页面数</span>
            <span className={styles.detailFieldValue}>{user._count.pages}</span>
          </div>

          <UserActions
            userId={user.id}
            role={user.role}
            status={user.status}
          />
        </div>

        <div className={styles.detailCard}>
          <h2 className={rootStyles.pageTitle} style={{ fontSize: 16 }}>活跃会话（最多 20 条）</h2>
          <div className={styles.sessionList}>
            {user.sessions.length === 0 ? (
              <div className={styles.sessionItem}>无活跃会话</div>
            ) : null}
            {user.sessions.map((s) => (
              <div className={styles.sessionItem} key={s.id}>
                <span>{s.ip ?? "unknown"}</span>
                <span>{s.userAgent?.slice(0, 40) ?? "—"}</span>
                <span>{s.createdAt.toISOString().slice(0, 16).replace("T", " ")}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
