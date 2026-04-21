import { listWallpapers } from "@/server/admin/content/wallpapers/service";
import { WallpaperUploader } from "./uploader";
import { WallpaperItem } from "./wallpaper-item";
import styles from "./wallpapers.module.css";
import rootStyles from "../../admin.module.css";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function readString(params: Record<string, string | string[] | undefined>, key: string): string {
  const v = params[key];
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function WallpapersPage({ searchParams }: Props) {
  const params = await searchParams;
  const colorModeParam = readString(params, "colorMode");
  const colorMode =
    colorModeParam === "day" || colorModeParam === "night" ? colorModeParam : undefined;
  const page = Math.max(1, Number(readString(params, "page")) || 1);

  let items: Awaited<ReturnType<typeof listWallpapers>>["items"] = [];
  let total = 0;
  let pageSize = 40;
  let dbError = "";

  try {
    const result = await listWallpapers({ colorMode, page });
    items = result.items;
    total = result.total;
    pageSize = result.pageSize;
  } catch (err) {
    dbError = err instanceof Error ? err.message : String(err);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={rootStyles.content}>
      <div className={styles.headerRow}>
        <h1 className={rootStyles.pageTitle}>壁纸库</h1>
        <span className={styles.stat}>共 {total} 张</span>
      </div>

      {dbError ? (
        <div style={{ color: "#c41d25", padding: "20px 0" }}>
          数据加载失败：{dbError}。请确认数据库迁移已执行（<code>npx prisma db push</code>）。
        </div>
      ) : (
        <>

      <WallpaperUploader />

      <form method="get" className={styles.filterForm}>
        <select name="colorMode" defaultValue={colorMode ?? ""} className={styles.select}>
          <option value="">全部主题色</option>
          <option value="day">白天</option>
          <option value="night">夜间</option>
        </select>
        <button className={styles.filterSubmit} type="submit">筛选</button>
      </form>

      {items.length === 0 ? (
        <div className={styles.empty}>暂无壁纸，使用上方表单添加。</div>
      ) : (
        <div className={styles.grid}>
          {items.map((w) => (
            <WallpaperItem
              key={w.id}
              id={w.id}
              name={w.name}
              url={w.url}
              hdUrl={w.hdUrl}
              description={w.description}
              colorMode={w.colorMode}
              category={w.category}
              sort={w.sort}
              createdAt={w.createdAt.toISOString()}
            />
          ))}
        </div>
      )}

      <div className={styles.pagination}>
        {page > 1 ? (
          <a href={`?colorMode=${colorMode ?? ""}&page=${page - 1}`} className={styles.pageBtn}>
            上一页
          </a>
        ) : null}
        <span>
          {page} / {totalPages}
        </span>
        {page < totalPages ? (
          <a href={`?colorMode=${colorMode ?? ""}&page=${page + 1}`} className={styles.pageBtn}>
            下一页
          </a>
        ) : null}
      </div>
        </>
      )}
    </div>
  );
}
