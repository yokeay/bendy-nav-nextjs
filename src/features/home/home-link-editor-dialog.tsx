"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { HomeLink, HomeSiteInfo } from "@/server/home/types";
import { requestLegacy } from "./home-client";
import styles from "./home-page.module.css";

type LinkEditorPayload = {
  id?: string;
  name: string;
  url: string;
  src: string;
  bgColor: string;
  pageGroup: string;
  tips: string;
  app: number;
};

type AddCardPayload = {
  id: number;
  name: string;
  name_en: string;
  tips: string;
  src: string;
  url: string;
  window: string;
  version: number;
  pageGroup: string;
};

type AddLinkDialogProps = {
  open: boolean;
  mode: "create" | "edit";
  activeGroupId: string;
  pageGroups: HomeLink[];
  site: Pick<HomeSiteInfo, "isPushLinkStore" | "isPushLinkStatus" | "isPushLinkStoreTips">;
  initialLink?: HomeLink | null;
  onClose: () => void;
  onSave: (payload: LinkEditorPayload) => Promise<void>;
  onAddCard?: (payload: AddCardPayload) => Promise<void>;
};

type FolderIcon = {
  src: string;
  name: string;
};

type CardCatalogItem = {
  id: number;
  name: string;
  name_en: string;
  tips: string;
  src: string;
  url: string;
  window: string;
  version: number;
  install_num: number;
};

type RecommendedLinkItem = {
  id: number;
  name: string;
  src: string;
  url: string;
  tips: string;
  app: number;
  bgColor: string | null;
};

type RecommendedLinkPage = {
  data: RecommendedLinkItem[];
};

function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://")
  ) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function resolveSiteIconUrl(value: string) {
  const normalized = normalizeUrl(value);
  if (!normalized) {
    return "";
  }

  try {
    const target = new URL(normalized);
    return `${target.origin}/favicon.ico`;
  } catch {
    return "";
  }
}

function resolvePageGroupLabel(group: HomeLink) {
  return group.name?.trim() || "首页";
}

function useFolderIcons(open: boolean) {
  const [folderIcons, setFolderIcons] = useState<FolderIcon[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }

    requestLegacy<FolderIcon[]>("/index/classFolderIcons")
      .then((response) => {
        setFolderIcons(Array.isArray(response.data) ? response.data : []);
      })
      .catch(() => {
        setFolderIcons([]);
      });
  }, [open]);

  return folderIcons;
}

function EditorFieldRow({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.editorRow}>
      <div className={styles.editorLabel}>{label}</div>
      <div className={styles.editorControl}>{children}</div>
    </div>
  );
}

export function AddLinkDialog({
  open,
  mode,
  activeGroupId,
  pageGroups,
  site,
  initialLink,
  onClose,
  onSave,
  onAddCard
}: AddLinkDialogProps) {
  const folderIcons = useFolderIcons(open);
  const [editorTab, setEditorTab] = useState<"link" | "recommend" | "card">("link");
  const [cards, setCards] = useState<CardCatalogItem[]>([]);
  const [recommendedLinks, setRecommendedLinks] = useState<RecommendedLinkItem[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [tips, setTips] = useState("");
  const [textIcon, setTextIcon] = useState("");
  const [imageIcon, setImageIcon] = useState("");
  const [customIconUrl, setCustomIconUrl] = useState("");
  const [iconMode, setIconMode] = useState<1 | 2 | 3>(2);
  const [bgColor, setBgColor] = useState("#ffffff");
  const [app, setApp] = useState(0);
  const [pushToStore, setPushToStore] = useState(site.isPushLinkStatus);
  const [selectedPageGroup, setSelectedPageGroup] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fetchingIcon, setFetchingIcon] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);

  const pageGroupOptions = useMemo(() => {
    if (pageGroups.length > 0) {
      return pageGroups.map((group) => ({
        id: group.id,
        label: resolvePageGroupLabel(group)
      }));
    }

    if (!activeGroupId) {
      return [];
    }

    return [
      {
        id: activeGroupId,
        label: "首页"
      }
    ];
  }, [activeGroupId, pageGroups]);

  useEffect(() => {
    if (!open) {
      setEditorTab("link");
      setCards([]);
      setRecommendedLinks([]);
      setCardsLoading(false);
      setRecommendLoading(false);
      setCatalogQuery("");
      setName("");
      setUrl("");
      setTips("");
      setTextIcon("");
      setImageIcon("");
      setCustomIconUrl("");
      setIconMode(2);
      setBgColor("#ffffff");
      setApp(0);
      setPushToStore(site.isPushLinkStatus);
      setSelectedPageGroup("");
      setSubmitting(false);
      setFetchingIcon(false);
      setUploadingIcon(false);
      return;
    }

    const defaultGroupId = initialLink?.pageGroup || activeGroupId || pageGroupOptions[0]?.id || "";
    setSelectedPageGroup(defaultGroupId);
    setPushToStore(site.isPushLinkStatus);
    setCatalogQuery("");

    if (mode === "create" && onAddCard) {
      setCardsLoading(true);
      requestLegacy<CardCatalogItem[]>(`/card/index?_t=${Date.now()}`)
        .then((response) => {
          setCards(Array.isArray(response.data) ? response.data : []);
        })
        .catch(() => {
          setCards([]);
        })
        .finally(() => {
          setCardsLoading(false);
        });

      setRecommendLoading(true);
      requestLegacy<RecommendedLinkPage>("/LinkStore/list", {
        method: "POST",
        data: {
          page: 1,
          limit: 36
        }
      })
        .then((response) => {
          setRecommendedLinks(Array.isArray(response.data?.data) ? response.data.data : []);
        })
        .catch(() => {
          setRecommendedLinks([]);
        })
        .finally(() => {
          setRecommendLoading(false);
        });
    }

    setName(initialLink?.name ?? "");
    setUrl(initialLink?.url ?? "");
    setTips(initialLink?.tips ?? "");
    if ((initialLink?.src ?? "").startsWith("txt:")) {
      setTextIcon((initialLink?.src ?? "").replace(/^txt:/, ""));
      setImageIcon("");
      setCustomIconUrl("");
      setIconMode(3);
    } else if (initialLink?.src) {
      setTextIcon("");
      setImageIcon(initialLink.src);
      setCustomIconUrl(initialLink.src);
      setIconMode(1);
    } else {
      setTextIcon("");
      setImageIcon("");
      setCustomIconUrl("");
      setIconMode(2);
    }
    setBgColor(initialLink?.bgColor ?? "#ffffff");
    setApp(initialLink?.app ?? 0);
  }, [activeGroupId, initialLink, mode, onAddCard, open, pageGroupOptions, site.isPushLinkStatus]);

  const filteredCards = useMemo(() => {
    const keyword = catalogQuery.trim().toLowerCase();
    if (!keyword) {
      return cards;
    }

    return cards.filter((card) =>
      [card.name, card.name_en, card.tips]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [cards, catalogQuery]);

  const filteredRecommendedLinks = useMemo(() => {
    const keyword = catalogQuery.trim().toLowerCase();
    if (!keyword) {
      return recommendedLinks;
    }

    return recommendedLinks.filter((item) =>
      [item.name, item.url, item.tips]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [catalogQuery, recommendedLinks]);

  const generatedIcon = useMemo(() => {
    const normalizedUrl = normalizeUrl(url);
    return normalizedUrl ? `/api/renderIco?seed=${encodeURIComponent(normalizedUrl)}` : "";
  }, [url]);

  const resolvedIcon = useMemo(() => {
    if (iconMode === 3 && textIcon.trim()) {
      return `txt:${textIcon.trim()}`;
    }

    if (iconMode === 2 && generatedIcon) {
      return generatedIcon;
    }

    const normalizedCustomIcon = normalizeUrl(customIconUrl);
    if (normalizedCustomIcon) {
      return normalizedCustomIcon;
    }

    return imageIcon || folderIcons[0]?.src || "/static/addIco.png";
  }, [customIconUrl, folderIcons, generatedIcon, iconMode, imageIcon, textIcon]);

  async function handleFetchIcon() {
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl || fetchingIcon) {
      return;
    }

    setFetchingIcon(true);
    try {
      let response: { data?: { src?: string; name?: string } } | null = null;

      try {
        response = await requestLegacy<{ src: string; name?: string }>("/LinkStore/getIcon", {
          method: "POST",
          data: { url: normalizedUrl }
        });
      } catch {
        response = await requestLegacy<{ src: string; name?: string }>("/api/getIcon", {
          method: "POST",
          data: { url: normalizedUrl }
        });
      }

      if (response.data?.src) {
        setImageIcon(response.data.src);
        setCustomIconUrl(response.data.src);
        setIconMode(1);
      }

      if (response.data?.name && !name.trim()) {
        setName(response.data.name.slice(0, 30));
      }
    } catch {
      const fallback = resolveSiteIconUrl(normalizedUrl);
      if (fallback) {
        setImageIcon(fallback);
        setCustomIconUrl(fallback);
        setIconMode(1);
      }
    } finally {
      setFetchingIcon(false);
    }
  }

  async function handleUploadIcon(file: File) {
    if (uploadingIcon) {
      return;
    }

    setUploadingIcon(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
        credentials: "same-origin"
      });
      const payload = (await response.json()) as { code?: number; data?: { url?: string }; msg?: string };

      if (!response.ok || Number(payload.code) !== 1 || !payload.data?.url) {
        throw new Error(payload.msg || "上传失败");
      }

      setImageIcon(payload.data.url);
      setCustomIconUrl(payload.data.url);
      setIconMode(1);
    } finally {
      setUploadingIcon(false);
    }
  }

  async function handleSubmit(closeAfterSave: boolean) {
    if (submitting) {
      return;
    }

    const normalizedName = name.trim();
    const normalizedUrl = normalizeUrl(url);
    if (!normalizedName || !normalizedUrl) {
      return;
    }

    const nextPayload = {
      id: initialLink?.id,
      name: normalizedName,
      url: normalizedUrl,
      src: resolvedIcon,
      bgColor,
      pageGroup: selectedPageGroup,
      tips: tips.trim(),
      app
    };

    setSubmitting(true);
    try {
      await onSave(nextPayload);

      if (mode === "create" && site.isPushLinkStore && pushToStore) {
        try {
          await requestLegacy<unknown>("/LinkStore/push", {
            method: "POST",
            data: nextPayload
          });
        } catch {
          // keep local add flow successful even if push store fails
        }
      }

      if (mode === "edit" || closeAfterSave) {
        onClose();
        return;
      }

      setName("");
      setUrl("");
      setTips("");
      setTextIcon("");
      setImageIcon("");
      setCustomIconUrl("");
      setBgColor("#ffffff");
      setApp(0);
      setIconMode(2);
      setCatalogQuery("");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddCard(card: CardCatalogItem) {
    if (!onAddCard) {
      return;
    }

    await onAddCard({
      ...card,
      pageGroup: selectedPageGroup
    });
    onClose();
  }

  async function handleAddRecommended(item: RecommendedLinkItem) {
    if (submitting) {
      return;
    }

    const normalizedUrl = normalizeUrl(item.url);
    const normalizedName = item.name.trim();
    if (!normalizedUrl || !normalizedName) {
      return;
    }

    setSubmitting(true);
    try {
      await onSave({
        name: normalizedName,
        url: normalizedUrl,
        src: normalizeUrl(item.src) || item.src || "/static/addIco.png",
        bgColor: item.bgColor || "#ffffff",
        pageGroup: selectedPageGroup,
        tips: item.tips?.trim() || "",
        app: item.app ?? 0
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  function renderPageGroupSelect() {
    return (
      <div className={styles.catalogField}>
        <span className={styles.catalogLabel}>目标页面</span>
        <select
          className={styles.actionSelectLight}
          value={selectedPageGroup}
          onChange={(event) => setSelectedPageGroup(event.target.value)}
        >
          {pageGroupOptions.map((group) => (
            <option key={group.id} value={group.id}>
              {group.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  function renderCatalogToolbar(title: string) {
    return (
      <div className={styles.catalogToolbar}>
        {renderPageGroupSelect()}
        <label className={styles.catalogField}>
          <span className={styles.catalogLabel}>{title}</span>
          <input
            className={styles.actionInputLight}
            value={catalogQuery}
            onChange={(event) => setCatalogQuery(event.target.value)}
            placeholder={`输入关键词筛选${title}`}
          />
        </label>
      </div>
    );
  }

  if (!open) {
    return null;
  }

  const showTabbedCreate = mode === "create" && Boolean(onAddCard);
  const pushTips = site.isPushLinkStoreTips?.trim() || "将当前标签提交到推荐标签库，供后台审核后推荐。";
  const recommendEmptyLabel = catalogQuery.trim()
    ? "没有找到匹配的推荐标签。"
    : "当前还没有推荐标签。";
  const cardEmptyLabel = catalogQuery.trim() ? "没有找到匹配的卡片应用。" : "目前还没有卡片应用哟！";

  return (
    <div className={styles.actionBackdrop} onClick={onClose}>
      <div className={styles.linkEditorDialog} onClick={(event) => event.stopPropagation()}>
        <div className={styles.actionHeader}>
          <div>
            <p className={styles.actionEyebrow}>快捷操作</p>
            <h2 className={styles.actionTitle}>{mode === "edit" ? "编辑标签" : "添加标签"}</h2>
          </div>
          <button className={styles.actionClose} type="button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        {showTabbedCreate ? (
          <div className={styles.actionTabs}>
            <button
              className={editorTab === "link" ? `${styles.segmentedItem} ${styles.segmentedItemActive}` : styles.segmentedItem}
              type="button"
              onClick={() => setEditorTab("link")}
            >
              添加标签
            </button>
            <button
              className={
                editorTab === "recommend" ? `${styles.segmentedItem} ${styles.segmentedItemActive}` : styles.segmentedItem
              }
              type="button"
              onClick={() => setEditorTab("recommend")}
            >
              推荐标签
            </button>
            <button
              className={editorTab === "card" ? `${styles.segmentedItem} ${styles.segmentedItemActive}` : styles.segmentedItem}
              type="button"
              onClick={() => setEditorTab("card")}
            >
              添加卡片
            </button>
          </div>
        ) : null}

        {editorTab === "link" ? (
          <div className={styles.linkEditorBody}>
            <div className={styles.linkEditorForm}>
              <EditorFieldRow label="归属页面">{renderPageGroupSelect()}</EditorFieldRow>

              <EditorFieldRow label="网络地址">
                <div className={styles.actionInline}>
                  <input
                    className={styles.actionInputLight}
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="请输入带 http 开头的网址"
                  />
                  <button className={styles.actionPrimarySoft} type="button" onClick={handleFetchIcon} disabled={fetchingIcon}>
                    {fetchingIcon ? "获取中..." : "获取图标"}
                  </button>
                </div>
              </EditorFieldRow>

              <EditorFieldRow label="链接名称">
                <input
                  className={styles.actionInputLight}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="标签名称"
                />
              </EditorFieldRow>

              <EditorFieldRow label="网址简介">
                <input
                  className={styles.actionInputLight}
                  value={tips}
                  onChange={(event) => setTips(event.target.value)}
                  placeholder="简单介绍标签（非必填）"
                />
              </EditorFieldRow>

              <EditorFieldRow label="文字图标">
                <input
                  className={styles.actionInputLight}
                  value={textIcon}
                  onChange={(event) => setTextIcon(event.target.value)}
                  placeholder="请输入 1-5 个字符的图标内容（可选）"
                />
              </EditorFieldRow>

              <EditorFieldRow label="图片图标">
                <div className={styles.actionInline}>
                  <input
                    className={styles.actionInputLight}
                    value={customIconUrl}
                    onChange={(event) => setCustomIconUrl(event.target.value)}
                    placeholder="请上传或粘贴标签图标地址，支持 png/jpg/ico/svg/webp"
                  />
                  <label className={styles.actionSecondarySoft}>
                    <input
                      className={styles.actionUploadInput}
                      type="file"
                      accept=".png,.jpg,.jpeg,.ico,.svg,.webp"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) {
                          return;
                        }
                        void handleUploadIcon(file);
                        event.currentTarget.value = "";
                      }}
                    />
                    {uploadingIcon ? "上传中..." : "手动上传"}
                  </label>
                </div>
              </EditorFieldRow>

              <EditorFieldRow label="选择图标">
                <div className={styles.actionModeRow}>
                  {textIcon.trim() ? (
                    <button
                      className={iconMode === 3 ? `${styles.actionModeCard} ${styles.actionModeCardActive}` : styles.actionModeCard}
                      type="button"
                      onClick={() => setIconMode(3)}
                    >
                      <span className={styles.actionModeSurface} style={{ backgroundColor: bgColor }}>
                        {textIcon.trim()}
                      </span>
                    </button>
                  ) : null}
                  {resolvedIcon && !resolvedIcon.startsWith("txt:") ? (
                    <button
                      className={iconMode === 1 ? `${styles.actionModeCard} ${styles.actionModeCardActive}` : styles.actionModeCard}
                      type="button"
                      onClick={() => setIconMode(1)}
                    >
                      <span className={styles.actionModeSurface} style={{ backgroundColor: bgColor }}>
                        <img src={normalizeUrl(customIconUrl) || imageIcon || folderIcons[0]?.src || "/static/addIco.png"} alt="" />
                      </span>
                    </button>
                  ) : null}
                  {generatedIcon ? (
                    <button
                      className={iconMode === 2 ? `${styles.actionModeCard} ${styles.actionModeCardActive}` : styles.actionModeCard}
                      type="button"
                      onClick={() => setIconMode(2)}
                    >
                      <span className={styles.actionModeSurface} style={{ backgroundColor: "#f3f4f6" }}>
                        <img src={generatedIcon} alt="" />
                      </span>
                    </button>
                  ) : null}
                </div>
              </EditorFieldRow>

              <EditorFieldRow label="背景颜色">
                <div className={styles.editorColorRow}>
                  <input
                    className={styles.actionColor}
                    type="color"
                    value={bgColor}
                    onChange={(event) => setBgColor(event.target.value)}
                  />
                </div>
              </EditorFieldRow>

              <EditorFieldRow label="内嵌窗口">
                <div className={styles.editorSwitchRow}>
                  <button
                    className={app === 1 ? `${styles.settingSwitch} ${styles.settingSwitchOn}` : styles.settingSwitch}
                    type="button"
                    onClick={() => setApp((current) => (current === 1 ? 0 : 1))}
                    aria-pressed={app === 1}
                  >
                    <span />
                  </button>
                  <span className={styles.editorHint}>内嵌窗口形式打开，第三方可能不兼容</span>
                </div>
              </EditorFieldRow>

              {mode === "create" && site.isPushLinkStore ? (
                <EditorFieldRow label="推送标签">
                  <label className={styles.pushStoreRow}>
                    <input
                      className={styles.pushStoreCheckbox}
                      type="checkbox"
                      checked={pushToStore}
                      onChange={(event) => setPushToStore(event.target.checked)}
                    />
                    <span className={styles.pushStoreText}>{pushTips}</span>
                  </label>
                </EditorFieldRow>
              ) : null}
            </div>

            <div className={styles.linkEditorSidebar}>
              <div className={styles.linkPreviewPanel}>
                <div className={styles.linkPreviewFrame} style={{ backgroundColor: bgColor }}>
                  {resolvedIcon.startsWith("txt:") ? (
                    <span className={styles.linkPreviewText}>{resolvedIcon.replace(/^txt:/, "")}</span>
                  ) : (
                    <img src={resolvedIcon} alt="" />
                  )}
                </div>
                <div className={styles.linkPreviewMeta}>
                  <strong>{name.trim() || "未命名标签"}</strong>
                  <span>{normalizeUrl(url) || "未设置跳转地址"}</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {editorTab === "recommend" ? (
          <div className={styles.catalogPanel}>
            {renderCatalogToolbar("推荐标签")}
            <div className={styles.recommendList}>
              {recommendLoading ? (
                <div className={styles.addCardEmpty}>正在加载推荐标签...</div>
              ) : filteredRecommendedLinks.length > 0 ? (
                filteredRecommendedLinks.map((item) => (
                  <div className={styles.recommendItem} key={`recommended-${item.id}`}>
                    <div className={styles.recommendHeader}>
                      <div className={styles.recommendIcon} style={{ backgroundColor: item.bgColor || "#ffffff" }}>
                        {item.src ? <img src={item.src} alt={item.name} /> : <span>{item.name.slice(0, 1)}</span>}
                      </div>
                      <div className={styles.recommendMeta}>
                        <h3>{item.name}</h3>
                        <p>{item.tips || item.url}</p>
                      </div>
                    </div>
                    <div className={styles.recommendFooter}>
                      <span className={styles.recommendUrl}>{item.url}</span>
                      <button
                        className={styles.actionPrimary}
                        type="button"
                        onClick={() => void handleAddRecommended(item)}
                        disabled={submitting}
                      >
                        添加标签
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.addCardEmpty}>{recommendEmptyLabel}</div>
              )}
            </div>
          </div>
        ) : null}

        {editorTab === "card" ? (
          <div className={styles.catalogPanel}>
            {renderCatalogToolbar("卡片应用")}
            <div className={styles.addCardWindow}>
              <div className={styles.addCardList}>
                {cardsLoading ? (
                  <div className={styles.addCardEmpty}>正在加载卡片列表...</div>
                ) : filteredCards.length > 0 ? (
                  filteredCards.map((card) => (
                    <div className={styles.addCardItem} key={`${card.name_en}-${card.id}`}>
                      <h3 className={styles.addCardTitle}>{card.name}</h3>
                      <p className={styles.addCardTips}>{card.tips}</p>
                      <div className={styles.addCardPreview}>
                        <iframe
                          className={styles.addCardPreviewFrame}
                          src={card.url}
                          title={card.name}
                          loading="lazy"
                        />
                      </div>
                      <div className={styles.addCardFooter}>
                        <span className={styles.addCardMeta}>安装量 {card.install_num}</span>
                        <button className={styles.actionPrimary} type="button" onClick={() => void handleAddCard(card)}>
                          添加
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className={styles.addCardEmpty}>{cardEmptyLabel}</div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        <div className={styles.actionFooter}>
          <button className={styles.actionSecondary} type="button" onClick={onClose}>
            取消
          </button>
          {editorTab === "link" && mode === "create" ? (
            <button className={styles.actionSecondary} type="button" onClick={() => void handleSubmit(false)} disabled={submitting}>
              {submitting ? "保存中..." : "保存并继续"}
            </button>
          ) : null}
          {editorTab === "link" ? (
            <button className={styles.actionPrimary} type="button" onClick={() => void handleSubmit(true)} disabled={submitting}>
              {submitting ? "保存中..." : "保存"}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
