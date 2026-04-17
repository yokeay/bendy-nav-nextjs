import prisma from "@/server/infrastructure/db/prisma";
import { revokeRefresh } from "@/server/auth/session";
import type { Role, UserStatus } from "@prisma/client";

export interface ListUsersParams {
  keyword?: string;
  role?: Role;
  status?: UserStatus;
  page?: number;
  pageSize?: number;
}

export async function listUsers(params: ListUsersParams) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
  const where = {
    deletedAt: null as Date | null,
    ...(params.role ? { role: params.role } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.keyword
      ? {
          OR: [
            { login: { contains: params.keyword, mode: "insensitive" as const } },
            { email: { contains: params.keyword, mode: "insensitive" as const } },
            { name: { contains: params.keyword, mode: "insensitive" as const } }
          ]
        }
      : {})
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        githubId: true,
        login: true,
        email: true,
        name: true,
        avatarUrl: true,
        role: true,
        status: true,
        createdAt: true,
        lastLoginAt: true
      }
    }),
    prisma.user.count({ where })
  ]);

  return { items, total, page, pageSize };
}

export async function getUser(id: string) {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null },
    include: {
      sessions: {
        where: { revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        take: 20
      },
      _count: { select: { links: true, pages: true } }
    }
  });
  return user;
}

export async function updateUser(
  id: string,
  patch: { role?: Role; status?: UserStatus }
) {
  return prisma.user.update({
    where: { id },
    data: patch
  });
}

export async function softDeleteUser(id: string) {
  await prisma.user.update({
    where: { id },
    data: { deletedAt: new Date(), status: "disabled" }
  });
  await revokeAllSessions(id);
}

export async function revokeAllSessions(userId: string): Promise<number> {
  const active = await prisma.session.findMany({
    where: { userId, revokedAt: null },
    select: { id: true, jti: true }
  });
  const now = new Date();
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: now }
  });
  await Promise.all(active.map((s) => revokeRefresh(s.jti)));
  return active.length;
}

export async function exportUsersCsv(): Promise<string> {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      githubId: true,
      login: true,
      email: true,
      name: true,
      role: true,
      status: true,
      createdAt: true,
      lastLoginAt: true
    }
  });

  const header = ["id", "github_id", "login", "email", "name", "role", "status", "created_at", "last_login_at"];
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = v instanceof Date ? v.toISOString() : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const rows = users.map((u) =>
    [u.id, u.githubId, u.login, u.email, u.name, u.role, u.status, u.createdAt, u.lastLoginAt]
      .map(escape)
      .join(",")
  );
  return [header.join(","), ...rows].join("\n");
}
