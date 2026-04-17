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
  const category = readString(params, "category");
  const page = Math.max(1, Number(readString(params, "page")) || 1);
  const { items, total, pageSize, categories } = await listWallpapers({
    category: category || undefined,
    page
  });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={rootStyles.content}>
      <div className={styles.headerRow}>
        <h1 className={rootStyles.pageTitle}>壁纸库</h1>
        <span className={styles.stat}>共 {total} 张</span>
      </div>

      <WallpaperUploader existingCategories={categories} currentCategory={category} />

      <form method="get" className={styles.filterForm}>
        <select name="category" defaultValue={category} className={styles.select}>
          <option value="">全部分类</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <button className={styles.filterSubmit} type="submit">筛选</button>
      </form>

      {items.length === 0 ? (
        <div className={styles.empty}>暂无壁纸，使用上方表单上传第一张。</div>
      ) : (
        <div className={styles.grid}>
          {items.map((w) => (
            <WallpaperItem
              key={w.id}
              id={w.id}
              url={w.url}
              category={w.category}
              sort={w.sort}
              createdAt={w.createdAt.toISOString()}
            />
          ))}
        </div>
      )}

      <div className={styles.pagination}>
        {page > 1 ? <a href={`?category=${encodeURIComponent(category)}&page=${page - 1}`} className={styles.pageBtn}>上一页</a> : null}
        <span>{page} / {totalPages}</span>
        {page < totalPages ? <a href={`?category=${encodeURIComponent(category)}&page=${page + 1}`} className={styles.pageBtn}>下一页</a> : null}
      </div>
    </div>
  );
}
