import { requireRole } from "@/server/auth/middleware";
import { exportUsersCsv } from "@/server/admin/users/service";

export async function GET() {
  try {
    await requireRole(["admin", "superadmin"]);
  } catch (res) {
    return res as Response;
  }
  const csv = await exportUsersCsv();
  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="bendy_users_${new Date().toISOString().slice(0, 10)}.csv"`
    }
  });
}
