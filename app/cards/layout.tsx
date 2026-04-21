import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { readSession } from "@/server/auth/middleware";
import Link from "next/link";
import styles from "./cards.module.css";

export const dynamic = "force-dynamic";

export default async function CardsLayout({ children }: { children: ReactNode }) {
  const session = await readSession();
  if (!session) {
    redirect("/");
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <Link href="/" className={styles.brand}>
            <img src="/brand/logo-64.png" alt="" className={styles.brandMark} />
            <span>笨迪卡片工作室</span>
          </Link>
          <nav className={styles.nav}>
            <Link href="/cards/new" className={styles.navItem}>新建卡片</Link>
            <Link href="/cards/my" className={styles.navItem}>我的提交</Link>
            <Link href="/" className={styles.navItem}>返回首页</Link>
          </nav>
          <div className={styles.userChip}>
            <span>{session.login}</span>
          </div>
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
