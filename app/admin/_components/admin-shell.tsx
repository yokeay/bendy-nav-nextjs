"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import styles from "../admin.module.css";

interface AdminShellProps {
  children: ReactNode;
  user: { id: string; login: string; email: string; role: string };
}

const NAV_ITEMS = [
  { href: "/admin", label: "概览" },
  { href: "/admin/users", label: "用户管理" },
  { href: "/admin/content/links", label: "书签与页面" },
  { href: "/admin/content/recommendations", label: "推荐中心" },
  { href: "/admin/content/wallpapers", label: "壁纸库" },
  { href: "/admin/content/templates", label: "默认模板" },
  { href: "/admin/audit", label: "审计日志" },
  { href: "/admin/settings", label: "系统设置" }
];

export function AdminShell({ children, user }: AdminShellProps) {
  const pathname = usePathname();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <img className={styles.brandMark} src="/brand/logo-192.png" alt="笨迪导航" />
          <div className={styles.brandInfo}>
            <span className={styles.brandText}>笨迪导航</span>
            <span className={styles.brandUser}>{user.login}</span>
          </div>
        </div>
        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || (item.href !== "/admin" && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? `${styles.navItem} ${styles.navItemActive}` : styles.navItem}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className={styles.main}>
        <header className={styles.topbar}>
          <div className={styles.topbarTitle}>后台管理</div>
          <div className={styles.topbarActions}>
            <span className={styles.userChip}>
              <span className={styles.userChipLogin}>{user.login}</span>
              <span className={styles.userChipRole}>{user.role}</span>
            </span>
            <form action="/api/auth/github/logout" method="post">
              <button className={styles.logoutBtn} type="submit">退出</button>
            </form>
          </div>
        </header>
        <main className={styles.mainInner}>{children}</main>
      </div>
    </div>
  );
}
