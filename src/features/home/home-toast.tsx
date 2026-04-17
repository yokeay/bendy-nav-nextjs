"use client";

import { useEffect } from "react";
import styles from "./home-page.module.css";

export type HomeToastTone = "success" | "error" | "info";

export type HomeToastItem = {
  id: number;
  message: string;
  tone: HomeToastTone;
};

export function HomeToastViewport({
  items,
  onDismiss
}: {
  items: HomeToastItem[];
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    const timers = items.map((item) =>
      window.setTimeout(() => {
        onDismiss(item.id);
      }, 3200)
    );

    return () => {
      for (const timer of timers) {
        window.clearTimeout(timer);
      }
    };
  }, [items, onDismiss]);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className={styles.toastViewport} aria-live="polite">
      {items.map((item) => (
        <div
          key={item.id}
          className={`${styles.toastItem} ${styles[`toast${item.tone[0].toUpperCase()}${item.tone.slice(1)}`]}`}
        >
          <span>{item.message}</span>
          <button type="button" onClick={() => onDismiss(item.id)} aria-label="关闭提示">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
