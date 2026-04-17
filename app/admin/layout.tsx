import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { readSession } from "@/server/auth/middleware";
import { AdminShell } from "./_components/admin-shell";
import styles from "./admin.module.css";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await readSession();
  if (!session || !["admin", "superadmin"].includes(session.role)) {
    redirect("/");
  }

  return (
    <div className={styles.root}>
      <AdminShell
        user={{
          id: session.sub,
          login: session.login,
          email: session.email,
          role: session.role
        }}
      >
        {children}
      </AdminShell>
    </div>
  );
}
