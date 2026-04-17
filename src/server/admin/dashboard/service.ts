import prisma from "@/server/infrastructure/db/prisma";

export interface DashboardMetrics {
  totalUsers: number;
  activeUsers: number;
  newUsersToday: number;
  activeSessions: number;
  totalLinks: number;
  totalWallpapers: number;
  totalTemplates: number;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [totalUsers, activeUsers, newUsersToday, activeSessions, totalLinks, totalWallpapers, totalTemplates] =
    await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { deletedAt: null, status: "active" } }),
      prisma.user.count({ where: { deletedAt: null, createdAt: { gte: startOfToday } } }),
      prisma.session.count({ where: { revokedAt: null, expiresAt: { gt: new Date() } } }),
      prisma.link.count(),
      prisma.wallpaper.count(),
      prisma.defaultTemplate.count()
    ]);

  return {
    totalUsers,
    activeUsers,
    newUsersToday,
    activeSessions,
    totalLinks,
    totalWallpapers,
    totalTemplates
  };
}

export interface RegistrationPoint {
  date: string;
  count: number;
}

export async function getRegistrationSeries(days = 30): Promise<RegistrationPoint[]> {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));

  const users = await prisma.user.findMany({
    where: { deletedAt: null, createdAt: { gte: start } },
    select: { createdAt: true }
  });

  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const u of users) {
    const key = u.createdAt.toISOString().slice(0, 10);
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  }
  return Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
}

export async function getRecentAudits(limit = 50) {
  return prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { actor: { select: { id: true, login: true, email: true } } }
  });
}
