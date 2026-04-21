"use client";

import { useState } from "react";
import styles from "../cards.module.css";
import { CARD_SIZES, type CardHost, type CardSize } from "@/server/cards/types";

interface Props {
  name: string;
  tips: string;
  icon: string;
  host: CardHost;
  size: CardSize;
  version: string;
}

export function CardPreview({ name, tips, icon, host, size, version }: Props) {
  const [previewSize, setPreviewSize] = useState<CardSize>(size);
  const effective = previewSize ?? size;

  return (
    <aside className={styles.previewCard}>
      <h3 className={styles.previewTitle}>实时预览</h3>
      <div className={styles.sizeGroup}>
        {CARD_SIZES.map((s) => (
          <button
            key={s}
            type="button"
            className={previewSize === s ? `${styles.sizeButton} ${styles.sizeButtonActive}` : styles.sizeButton}
            onClick={() => setPreviewSize(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <div className={styles.previewTile} data-size={effective}>
        {icon ? (
          <img src={icon} alt="" className={styles.previewIcon} />
        ) : (
          <div className={styles.previewIcon} />
        )}
        <div className={styles.previewName}>{name}</div>
        {tips ? <div className={styles.previewTips}>{tips}</div> : null}
      </div>
      <div className={styles.previewMeta}>
        <span>宿主：{host}</span>
        <span>版本：{version || "—"}</span>
      </div>
    </aside>
  );
}
