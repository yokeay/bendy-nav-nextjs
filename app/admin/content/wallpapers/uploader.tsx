"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./wallpapers.module.css";

interface Props {
  existingCategories: string[];
  currentCategory: string;
}

export function WallpaperUploader({ existingCategories, currentCategory }: Props) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState(currentCategory || existingCategories[0] || "default");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) {
      setError("请选择文件");
      return;
    }
    setPending(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("category", category.trim() || "default");
    try {
      const res = await fetch("/api/admin/wallpapers", { method: "POST", body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? `HTTP ${res.status}`);
        return;
      }
      setFile(null);
      (document.getElementById("wallpaper-upload-input") as HTMLInputElement | null)?.value && ((document.getElementById("wallpaper-upload-input") as HTMLInputElement).value = "");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className={styles.uploader}>
      <input
        id="wallpaper-upload-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className={styles.fileInput}
      />
      <input
        type="text"
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        placeholder="分类"
        className={styles.input}
      />
      <button type="submit" className={styles.uploadBtn} disabled={pending || !file}>
        {pending ? "上传中..." : "上传壁纸"}
      </button>
      {error ? <span className={styles.errorText}>{error}</span> : null}
    </form>
  );
}
