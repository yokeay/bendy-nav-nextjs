"use client";

import Link from "next/link";
import type { CSSProperties, FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import type { HomeConfig, HomeData, HomeLink, HomeSearchEngine, HomeTheme } from "@/server/home/types";
import { AddLinkDialog, BackgroundDialog, PageGroupManagerDialog, buildActionLink } from "./home-actions";
import { AuthDialog, UserMenu } from "./home-auth";
import { requestLegacy } from "./home-client";
import { HomeSettingsDialog } from "./home-settings";
import { HomeToastViewport, type HomeToastItem, type HomeToastTone } from "./home-toast";
import styles from "./home-page.module.css";

const LOCAL_HOME_CONFIG_STORAGE_KEY = "config";
const SEARCH_ENGINE_STORAGE_KEY = "SearchEngineLocal";
const LOCAL_HOME_LINK_STORAGE_KEY = "link";
const LOCAL_HOME_TABBAR_STORAGE_KEY = "tabbar";
const PAGE_GROUP_STORAGE_KEY = "bendy.home.page-group";

type HomePageProps = {
  data: HomeData;
};

type TimeState = {
  value: string;
  meta: string[];
};

function mergeHomeConfig(
  baseConfig: HomeConfig,
  incoming:
    | {
        openType?: Partial<HomeConfig["openType"]>;
        theme?: Partial<HomeConfig["theme"]>;
      }
    | null
    | undefined
): HomeConfig {
  return {
    openType: {
      ...baseConfig.openType,
      ...(incoming?.openType ?? {})
    },
    theme: {
      ...baseConfig.theme,
      ...(incoming?.theme ?? {})
    }
  };
}

function buildTimeState(theme: HomeTheme, date: Date): TimeState {
  const timeFormatter = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: theme.timeSecond ? "2-digit" : undefined,
    hour12: !theme.time24
  });
  const value = timeFormatter.format(date);

  const meta: string[] = [];
  if (theme.timeMonthDay) {
    meta.push(
      new Intl.DateTimeFormat("zh-CN", {
        month: "2-digit",
        day: "2-digit"
      }).format(date)
    );
  }

  if (theme.timeWeek) {
    meta.push(
      new Intl.DateTimeFormat("zh-CN", {
        weekday: "long"
      }).format(date)
    );
  }

  if (theme.timeLunar) {
    meta.push(
      new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
        month: "long",
        day: "numeric"
      }).format(date)
    );
  }

  if (theme.timeGanZhi) {
    const chineseYear = new Intl.DateTimeFormat("zh-CN-u-ca-chinese", {
      year: "numeric"
    }).format(date);
    meta.push(chineseYear.replace(/^\d+/u, ""));
  }

  return { value, meta };
}

function toGridSpan(size: string) {
  switch (size) {
    case "1x2":
      return { column: 1, row: 2 };
    case "2x2":
      return { column: 2, row: 2 };
    case "2x4":
      return { column: 4, row: 2 };
    default:
      return { column: 1, row: 1 };
  }
}

function isSpecialLegacyLink(link: HomeLink): boolean {
  return link.url.startsWith("tab://");
}

function isTextIcon(link: HomeLink): boolean {
  return link.src.startsWith("txt:");
}

function isRenderableTile(link: HomeLink): boolean {
  if (link.type === "component" && link.component === "iconGroup") {
    return true;
  }

  return link.type === "icon" && !isSpecialLegacyLink(link);
}

function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function resolveTileLabel(link: HomeLink): string {
  return link.name || link.tips || link.url || "未命名";
}

function isInternalLink(url: string): boolean {
  return url.startsWith("/");
}

function buildSidebarLinks(data: HomeData) {
  const dynamicGroups = data.pageGroups.map((group) => ({
    type: "group" as const,
    id: group.id,
    label: resolveTileLabel(group),
    icon: group.src || "/static/pageGroup/home.svg"
  }));

  return [
    {
      type: "group" as const,
      id: "",
      label: "首页",
      icon: "/static/pageGroup/home.svg"
    },
    ...dynamicGroups,
    {
      type: "link" as const,
      id: "legacy",
      label: "旧版",
      icon: "/dist/assets/kongzhi.23e322eb.1766672520393.svg",
      href: data.legacyUrl
    },
    {
      type: "link" as const,
      id: "privacy",
      label: "隐私",
      icon: "/dist/assets/setting.6abb23f3.1766672520393.svg",
      href: "/privacy"
    }
  ];
}

function buildRootTiles(data: HomeData, activeGroupId: string) {
  return data.links.filter((item) => {
    if (item.type === "pageGroup") {
      return false;
    }

    if (item.pid) {
      return false;
    }

    if (!isRenderableTile(item)) {
      return false;
    }

    if (activeGroupId) {
      return item.pageGroup === activeGroupId;
    }

    return !item.pageGroup;
  });
}

function isActionTile(link: HomeLink): boolean {
  return ["tab://addicon", "tab://background", "tab://setting"].includes(link.url);
}

function buildVisibleTiles(links: HomeLink[], activeGroupId: string) {
  return [...links]
    .filter((item) => {
      if (item.type === "pageGroup") {
        return false;
      }

      if (item.pid) {
        return false;
      }

      if (!isRenderableTile(item) && !isActionTile(item)) {
        return false;
      }

      if (activeGroupId) {
        return item.pageGroup === activeGroupId;
      }

      return !item.pageGroup;
    })
    .sort((left, right) => {
      if (left.sort === right.sort) {
        return left.id.localeCompare(right.id);
      }

      return left.sort - right.sort;
    });
}

function normalizeLinksOrder(links: HomeLink[]) {
  return [...links].sort((left, right) => {
    if (left.sort === right.sort) {
      return left.id.localeCompare(right.id);
    }

    return left.sort - right.sort;
  });
}

function canEditTile(link: HomeLink) {
  return link.type === "icon" && !isSpecialLegacyLink(link);
}

function buildFolderChildren(links: HomeLink[], folderId: string) {
  return links.filter((item) => item.pid === folderId && item.type === "icon" && !isSpecialLegacyLink(item));
}

function buildDockLinks(data: HomeData) {
  return data.tabbar.filter((item) => item.type === "icon" && !isSpecialLegacyLink(item)).slice(0, 9);
}

function normalizeTabbarOrder(links: HomeLink[]) {
  return [...links]
    .filter((item) => item.type === "icon" && !isSpecialLegacyLink(item))
    .sort((left, right) => {
      if (left.sort === right.sort) {
        return left.id.localeCompare(right.id);
      }

      return left.sort - right.sort;
    });
}

function getTileStyle(link: HomeLink): CSSProperties {
  const span = toGridSpan(link.size);
  return {
    gridColumn: `span ${span.column}`,
    gridRow: `span ${span.row}`
  };
}

function getLinkSurfaceStyle(link: HomeLink): CSSProperties {
  return {
    background: link.bgColor || "rgba(255, 255, 255, 0.14)"
  };
}

function Sidebar({
  data,
  pageGroups,
  activeGroupId,
  editMode,
  onSelectGroup,
  onOpenGroupManager,
  onEditGroup,
  onDeleteGroup
}: {
  data: HomeData;
  pageGroups: HomeLink[];
  activeGroupId: string;
  editMode: boolean;
  onSelectGroup: (groupId: string) => void;
  onOpenGroupManager: () => void;
  onEditGroup: (groupId: string) => void;
  onDeleteGroup: (groupId: string) => void;
}) {
  const sidebarLinks = buildSidebarLinks({
    ...data,
    pageGroups
  });

  return (
    <aside className={styles.sidebar}>
      <div className={styles.sidebarGroup}>
        <Link className={styles.sidebarLink} href="/" title={data.site.title}>
          <img className={styles.sidebarLogo} src={data.site.logo} alt={data.site.title} />
        </Link>
        {sidebarLinks.map((item) => {
          if (item.type === "group") {
            const isActive = activeGroupId === item.id;
            const className = isActive
              ? `${styles.sidebarLink} ${styles.sidebarLinkActive}`
              : styles.sidebarLink;
            const canManageGroup = editMode && item.id;

            return (
              <div className={styles.sidebarRow} key={item.id || "home"}>
                {canManageGroup ? (
                  <div className={styles.sidebarRowControls}>
                    <button
                      className={styles.sidebarRowButton}
                      type="button"
                      onClick={() => onEditGroup(item.id)}
                      aria-label={`编辑分组 ${item.label}`}
                    >
                      ✎
                    </button>
                    <button
                      className={styles.sidebarRowDelete}
                      type="button"
                      onClick={() => onDeleteGroup(item.id)}
                      aria-label={`删除分组 ${item.label}`}
                    >
                      ×
                    </button>
                  </div>
                ) : null}
                <button
                  className={className}
                  type="button"
                  onClick={() => onSelectGroup(item.id)}
                  title={item.label}
                  aria-label={item.label}
                >
                  <img className={styles.sidebarIcon} src={item.icon} alt="" />
                  <span className={styles.sidebarText}>{item.label}</span>
                </button>
              </div>
            );
          }

          return (
            <Link
              key={item.id}
              className={styles.sidebarLink}
              href={item.href}
              title={item.label}
              aria-label={item.label}
            >
              <img className={styles.sidebarIcon} src={item.icon} alt="" />
              <span className={styles.sidebarText}>{item.label}</span>
            </Link>
          );
        })}
        {editMode ? (
          <button
            className={styles.sidebarLink}
            type="button"
            onClick={onOpenGroupManager}
            title="分组管理"
            aria-label="分组管理"
          >
            <img className={styles.sidebarIcon} src="/dist/assets/add.c36dce54.1766672520393.svg" alt="" />
            <span className={styles.sidebarText}>分组</span>
          </button>
        ) : null}
      </div>
      <div className={styles.sidebarGroup} />
    </aside>
  );
}

function Toolbar({
  compactMode,
  editMode,
  onToggleCompact,
  legacyUrl,
  user,
  onOpenAuth,
  onOpenSettings,
  onToggleEditMode,
  onNotify
}: {
  compactMode: boolean;
  editMode: boolean;
  onToggleCompact: () => void;
  legacyUrl: string;
  user: HomeData["user"];
  onOpenAuth: () => void;
  onOpenSettings: () => void;
  onToggleEditMode: () => void;
  onNotify: (message: string, tone?: HomeToastTone) => void;
}) {
  return (
    <div className={styles.toolbar}>
      {user ? (
        <UserMenu user={user} legacyUrl={legacyUrl} onNotify={onNotify} />
      ) : (
        <button className={styles.userButton} type="button" onClick={onOpenAuth}>
          <img className={styles.userAvatar} src="/brand/logo-192.png" alt="" />
          <span className={styles.userButtonText}>登录</span>
        </button>
      )}
      <Link className={styles.toolbarButton} href={legacyUrl} title="打开兼容模式">
        <img src="/dist/assets/kongzhi.23e322eb.1766672520393.svg" alt="" />
      </Link>
      <button className={styles.toolbarButton} type="button" onClick={onOpenSettings} title="打开设置中心">
        <img src="/dist/assets/setting.6abb23f3.1766672520393.svg" alt="" />
      </button>
      <button
        className={styles.toolbarButton}
        type="button"
        onClick={onToggleEditMode}
        title={editMode ? "退出编辑模式" : "进入编辑模式"}
      >
        <img src="/dist/assets/edit.619ba3d7.1766672520393.svg" alt="" />
      </button>
      <button
        className={styles.toolbarButton}
        type="button"
        onClick={onToggleCompact}
        title={compactMode ? "切换到标准模式" : "切换到简洁模式"}
      >
        <img
          src={
            compactMode
              ? "/dist/assets/apps.1b96d9dd.1766672520393.svg"
              : "/dist/assets/light.8db34f6e.1766672520393.svg"
          }
          alt=""
        />
      </button>
    </div>
  );
}

function ClockPanel({ theme }: { theme: HomeTheme }) {
  const [clock, setClock] = useState<TimeState>(() => buildTimeState(theme, new Date()));

  useEffect(() => {
    const timer = window.setInterval(() => {
      setClock(buildTimeState(theme, new Date()));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [theme]);

  if (!theme.timeView) {
    return null;
  }

  return (
    <div className={styles.timePanel} style={{ color: theme.timeColor }}>
      <div className={styles.timeValue}>{clock.value}</div>
      <div className={styles.timeMeta}>
        {clock.meta.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}

function SearchBar({
  engines,
  searchOpen
}: {
  engines: HomeSearchEngine[];
  searchOpen: boolean;
}) {
  const [query, setQuery] = useState("");
  const [engineIndex, setEngineIndex] = useState(0);

  useEffect(() => {
    const storedKey = window.localStorage.getItem(SEARCH_ENGINE_STORAGE_KEY);
    if (!storedKey) {
      return;
    }

    const nextIndex = engines.findIndex((engine) => engine.key === storedKey);
    if (nextIndex >= 0) {
      setEngineIndex(nextIndex);
    }
  }, [engines]);

  useEffect(() => {
    window.localStorage.setItem(
      SEARCH_ENGINE_STORAGE_KEY,
      engines[engineIndex]?.key ?? engines[0]?.key ?? "bing"
    );
  }, [engineIndex, engines]);

  const currentEngine = engines[engineIndex] ?? engines[0];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const keyword = query.trim();
    if (!keyword) {
      return;
    }

    const url = new URL(currentEngine.action);
    url.searchParams.set(currentEngine.queryParam, keyword);
    window.open(url.toString(), searchOpen ? "_blank" : "_self", "noopener,noreferrer");
  }

  return (
    <form className={styles.searchShell} onSubmit={handleSubmit}>
      <button
        className={styles.searchEngineButton}
        type="button"
        onClick={() => setEngineIndex((engineIndex + 1) % engines.length)}
        title={`切换搜索引擎，当前为 ${currentEngine.name}`}
      >
        <img src={currentEngine.icon} alt="" />
        <span>{currentEngine.name}</span>
      </button>
      <input
        className={styles.searchInput}
        name="keyword"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="输入并搜索..."
      />
      <button className={styles.searchSubmit} type="submit" aria-label="开始搜索">
        <img src="/dist/assets/search.e0864ada.1766672520393.svg" alt="" />
      </button>
    </form>
  );
}

function TileEditControls({
  onEdit,
  onDelete,
  onPin
}: {
  onEdit: () => void;
  onDelete: () => void;
  onPin?: () => void;
}) {
  return (
    <div className={styles.tileEditActions}>
      {onPin ? (
        <button
          className={styles.tileEditButton}
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onPin();
          }}
          aria-label="加入 Dock"
        >
          +
        </button>
      ) : null}
      <button
        className={styles.tileEditButton}
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onEdit();
        }}
        aria-label="编辑"
      >
        ✎
      </button>
      <button
        className={styles.tileDeleteButton}
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onDelete();
        }}
        aria-label="删除"
      >
        ×
      </button>
    </div>
  );
}

function IconTile({
  link,
  openInBlank,
  editMode,
  isDragging,
  isDropTarget,
  onEdit,
  onDelete,
  onPin,
  onDragStart,
  onDragEnter,
  onDrop,
  onDragEnd
}: {
  link: HomeLink;
  openInBlank: boolean;
  editMode: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onPin?: () => void;
  onDragStart?: () => void;
  onDragEnter?: () => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
}) {
  const label = resolveTileLabel(link);
  const target = openInBlank && !isInternalLink(link.url) ? "_blank" : "_self";
  const rel = target === "_blank" ? "noreferrer" : undefined;
  const tileClassName = [
    styles.tile,
    isDragging ? styles.tileDragging : "",
    isDropTarget ? styles.tileDropTarget : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={tileClassName}
      style={getTileStyle(link)}
      draggable={editMode}
      onDragStart={editMode ? onDragStart : undefined}
      onDragEnter={editMode ? onDragEnter : undefined}
      onDragOver={editMode ? (event) => event.preventDefault() : undefined}
      onDrop={editMode ? onDrop : undefined}
      onDragEnd={editMode ? onDragEnd : undefined}
    >
      {editMode && onEdit && onDelete ? (
        <TileEditControls onEdit={onEdit} onDelete={onDelete} onPin={onPin} />
      ) : null}
      <a
        className={styles.tileAction}
        href={link.url}
        title={link.tips || label}
        target={target}
        rel={rel}
        onClick={editMode ? (event) => event.preventDefault() : undefined}
        style={getLinkSurfaceStyle(link)}
      >
        {isTextIcon(link) ? (
          <span className={styles.tileIconText}>{link.src.replace(/^txt:/, "")}</span>
        ) : (
          <img className={styles.tileIconBox} src={link.src} alt={label} />
        )}
      </a>
      <span className={styles.tileLabel}>{label}</span>
    </div>
  );
}

function ActionTile({
  link,
  editMode,
  isDragging,
  isDropTarget,
  onClick,
  onDragStart,
  onDragEnter,
  onDrop,
  onDragEnd
}: {
  link: HomeLink;
  editMode: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onClick: () => void;
  onDragStart?: () => void;
  onDragEnter?: () => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
}) {
  const label = resolveTileLabel(link);
  const tileClassName = [
    styles.tile,
    isDragging ? styles.tileDragging : "",
    isDropTarget ? styles.tileDropTarget : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={tileClassName}
      style={getTileStyle(link)}
      draggable={editMode}
      onDragStart={editMode ? onDragStart : undefined}
      onDragEnter={editMode ? onDragEnter : undefined}
      onDragOver={editMode ? (event) => event.preventDefault() : undefined}
      onDrop={editMode ? onDrop : undefined}
      onDragEnd={editMode ? onDragEnd : undefined}
    >
      <button
        className={styles.tileAction}
        type="button"
        title={link.tips || label}
        onClick={onClick}
        style={getLinkSurfaceStyle(link)}
      >
        {isTextIcon(link) ? (
          <span className={styles.tileIconText}>{link.src.replace(/^txt:/, "")}</span>
        ) : (
          <img className={styles.tileIconBox} src={link.src} alt={label} />
        )}
      </button>
      <span className={styles.tileLabel}>{label}</span>
    </div>
  );
}

function FolderTile({
  link,
  children,
  onOpen,
  editMode,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragEnter,
  onDrop,
  onDragEnd
}: {
  link: HomeLink;
  children: HomeLink[];
  onOpen: () => void;
  editMode: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart?: () => void;
  onDragEnter?: () => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
}) {
  const slots = children.slice(0, 4);
  const tileClassName = [
    styles.tile,
    isDragging ? styles.tileDragging : "",
    isDropTarget ? styles.tileDropTarget : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={tileClassName}
      style={getTileStyle(link)}
      draggable={editMode}
      onDragStart={editMode ? onDragStart : undefined}
      onDragEnter={editMode ? onDragEnter : undefined}
      onDragOver={editMode ? (event) => event.preventDefault() : undefined}
      onDrop={editMode ? onDrop : undefined}
      onDragEnd={editMode ? onDragEnd : undefined}
    >
      <button
        className={`${styles.tileAction} ${styles.folderCard}`}
        type="button"
        onClick={onOpen}
        title={link.tips || resolveTileLabel(link)}
      >
        <div className={styles.folderGrid}>
          {slots.map((child) => (
            <div className={styles.folderSlot} key={child.id}>
              {isTextIcon(child) ? (
                <span className={styles.tileIconText}>{child.src.replace(/^txt:/, "")}</span>
              ) : (
                <img src={child.src} alt="" />
              )}
            </div>
          ))}
          {Array.from({ length: Math.max(0, 4 - slots.length) }).map((_, index) => (
            <div className={`${styles.folderSlot} ${styles.folderSlotEmpty}`} key={`empty-${index}`} />
          ))}
        </div>
      </button>
      <span className={styles.tileLabel}>{resolveTileLabel(link)}</span>
    </div>
  );
}

function FolderModal({
  folder,
  items,
  openInBlank,
  onClose
}: {
  folder: HomeLink;
  items: HomeLink[];
  openInBlank: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [onClose]);

  return (
    <div className={styles.folderBackdrop} onClick={onClose}>
      <div className={styles.folderPanel} onClick={(event) => event.stopPropagation()}>
        <div className={styles.folderPanelHeader}>
          <h2 className={styles.folderPanelTitle}>{resolveTileLabel(folder)}</h2>
          <button className={styles.folderPanelClose} type="button" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className={styles.folderPanelGrid}>
          {items.map((item) => (
            <IconTile
              key={item.id}
              link={item}
              openInBlank={openInBlank}
              editMode={false}
              isDragging={false}
              isDropTarget={false}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Dock({
  links,
  openInBlank,
  editMode,
  draggingDockId,
  dockDropTargetId,
  onRemove,
  onDragStart,
  onDragEnter,
  onDrop,
  onDragEnd
}: {
  links: HomeLink[];
  openInBlank: boolean;
  editMode: boolean;
  draggingDockId: string;
  dockDropTargetId: string;
  onRemove: (linkId: string) => void;
  onDragStart: (linkId: string) => void;
  onDragEnter: (linkId: string) => void;
  onDrop: (linkId: string) => void;
  onDragEnd: () => void;
}) {
  if (links.length === 0) {
    return null;
  }

  return (
    <div className={styles.dock}>
      {links.map((item) => {
        const target = openInBlank && !isInternalLink(item.url) ? "_blank" : "_self";
        const rel = target === "_blank" ? "noreferrer" : undefined;
        const dockItemClassName = [
          styles.dockItem,
          draggingDockId === item.id ? styles.tileDragging : "",
          dockDropTargetId === item.id && draggingDockId !== item.id ? styles.tileDropTarget : ""
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <a
            key={item.id}
            className={dockItemClassName}
            href={item.url}
            target={target}
            rel={rel}
            title={resolveTileLabel(item)}
            draggable={editMode}
            onDragStart={editMode ? () => onDragStart(item.id) : undefined}
            onDragEnter={editMode ? () => onDragEnter(item.id) : undefined}
            onDragOver={editMode ? (event) => event.preventDefault() : undefined}
            onDrop={editMode ? () => onDrop(item.id) : undefined}
            onDragEnd={editMode ? onDragEnd : undefined}
            onClick={editMode ? (event) => event.preventDefault() : undefined}
          >
            {editMode ? (
              <button
                className={styles.tileDeleteButton}
                type="button"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onRemove(item.id);
                }}
                aria-label="移出 Dock"
              >
                ×
              </button>
            ) : null}
            <span className={styles.dockItemFrame} style={getLinkSurfaceStyle(item)}>
              {isTextIcon(item) ? (
                <span className={styles.tileIconText}>{item.src.replace(/^txt:/, "")}</span>
              ) : (
                <img src={item.src} alt={resolveTileLabel(item)} />
              )}
            </span>
            <span className={styles.dockItemLabel}>{resolveTileLabel(item)}</span>
          </a>
        );
      })}
    </div>
  );
}

function RecordBar({ site }: { site: HomeData["site"] }) {
  const items = [];

  if (site.recordNumber) {
    items.push(
      <a key="record" href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">
        {site.recordNumber}
      </a>
    );
  }

  if (site.beianMps) {
    items.push(
      <a
        key="beian"
        href={`https://beian.mps.gov.cn/#/query/webSearch?code=${encodeURIComponent(site.beianMps)}`}
        target="_blank"
        rel="noreferrer"
      >
        公安备案 {site.beianMps}
      </a>
    );
  }

  if (site.copyright) {
    items.push(<span key="copyright">{stripHtmlTags(site.copyright)}</span>);
  }

  if (items.length === 0) {
    return null;
  }

  return <div className={styles.recordBar}>{items}</div>;
}

function NoticeBanner({
  title,
  message,
  onClose
}: {
  title: string;
  message: string;
  onClose: () => void;
}) {
  return (
    <div className={styles.noticeBanner}>
      <div className={styles.noticeBody}>
        <p className={styles.noticeTitle}>{title}</p>
        <p className={styles.noticeMessage}>{message}</p>
      </div>
      <button className={styles.noticeClose} type="button" onClick={onClose} aria-label="关闭通知">
        ×
      </button>
    </div>
  );
}

export function HomePage({ data }: HomePageProps) {
  const [activeGroupId, setActiveGroupId] = useState("");
  const [currentConfig, setCurrentConfig] = useState<HomeConfig>(data.config);
  const [currentLinks, setCurrentLinks] = useState<HomeLink[]>(data.links);
  const [currentTabbar, setCurrentTabbar] = useState<HomeLink[]>(normalizeTabbarOrder(data.tabbar));
  const [editMode, setEditMode] = useState(false);
  const [openFolderId, setOpenFolderId] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<HomeLink | null>(null);
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const [groupManagerOpen, setGroupManagerOpen] = useState(false);
  const [groupManagerInitialId, setGroupManagerInitialId] = useState("");
  const [draggingTileId, setDraggingTileId] = useState("");
  const [dropTargetId, setDropTargetId] = useState("");
  const [draggingDockId, setDraggingDockId] = useState("");
  const [dockDropTargetId, setDockDropTargetId] = useState("");
  const [noticeOpen, setNoticeOpen] = useState(Boolean(data.notice));
  const [toasts, setToasts] = useState<HomeToastItem[]>([]);

  const notify = useCallback((message: string, tone: HomeToastTone = "info") => {
    setToasts((current) => [
      ...current,
      {
        id: Date.now() + Math.floor(Math.random() * 1000),
        message,
        tone
      }
    ]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    if (!data.user) {
      const localConfigRaw = window.localStorage.getItem(LOCAL_HOME_CONFIG_STORAGE_KEY);
      if (localConfigRaw) {
        try {
          const parsed = JSON.parse(localConfigRaw) as Partial<HomeConfig>;
          setCurrentConfig((baseConfig) => mergeHomeConfig(baseConfig, parsed));
        } catch {
          // ignore invalid local config
        }
      }

      const localLinksRaw = window.localStorage.getItem(LOCAL_HOME_LINK_STORAGE_KEY);
      if (localLinksRaw) {
        try {
          const parsed = JSON.parse(localLinksRaw) as HomeLink[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCurrentLinks(parsed);
          }
        } catch {
          // ignore invalid local links
        }
      }

      const localTabbarRaw = window.localStorage.getItem(LOCAL_HOME_TABBAR_STORAGE_KEY);
      if (localTabbarRaw) {
        try {
          const parsed = JSON.parse(localTabbarRaw) as HomeLink[];
          if (Array.isArray(parsed) && parsed.length > 0) {
            setCurrentTabbar(normalizeTabbarOrder(parsed));
          }
        } catch {
          // ignore invalid local tabbar
        }
      }
    }

    const storedGroupId = window.localStorage.getItem(PAGE_GROUP_STORAGE_KEY);
    if (!storedGroupId) {
      return;
    }

    if (
      storedGroupId === "" ||
      currentLinks.some((group) => group.type === "pageGroup" && group.id === storedGroupId)
    ) {
      setActiveGroupId(storedGroupId);
    }
  }, [currentLinks, data.user]);

  useEffect(() => {
    window.localStorage.setItem(PAGE_GROUP_STORAGE_KEY, activeGroupId);
  }, [activeGroupId]);

  useEffect(() => {
    if (!editMode) {
      setDraggingTileId("");
      setDropTargetId("");
      setDraggingDockId("");
      setDockDropTargetId("");
      setOpenFolderId("");
    }
  }, [editMode]);

  async function handleSaveSettings() {
    if (settingsSaving) {
      return;
    }

    setSettingsSaving(true);
    try {
      if (data.user) {
        await requestLegacy<unknown>("/config/update", {
          method: "POST",
          data: { config: currentConfig }
        });
        notify("设置已保存到当前账户。", "success");
      } else {
        window.localStorage.setItem(LOCAL_HOME_CONFIG_STORAGE_KEY, JSON.stringify(currentConfig));
        notify("设置已保存到当前浏览器。", "success");
      }
      setSettingsOpen(false);
    } catch (error) {
      notify(error instanceof Error ? error.message : "保存设置失败。", "error");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function persistLinks(nextLinks: HomeLink[]) {
    const normalizedLinks = normalizeLinksOrder(nextLinks);
    if (data.user) {
      await requestLegacy<unknown>("/link/update", {
        method: "POST",
        data: { link: normalizedLinks }
      });
    } else {
      window.localStorage.setItem(LOCAL_HOME_LINK_STORAGE_KEY, JSON.stringify(normalizedLinks));
    }
    setCurrentLinks(normalizedLinks);
  }

  async function persistTabbar(nextTabbar: HomeLink[]) {
    const normalizedTabbar = normalizeTabbarOrder(nextTabbar).map((item, index) => ({
      ...item,
      sort: index
    }));

    if (data.user) {
      await requestLegacy<unknown>("/tabbar/update", {
        method: "POST",
        data: { tabbar: normalizedTabbar }
      });
    } else {
      window.localStorage.setItem(LOCAL_HOME_TABBAR_STORAGE_KEY, JSON.stringify(normalizedTabbar));
    }

    setCurrentTabbar(normalizedTabbar);
  }

  async function handleSaveLink(payload: {
    id?: string;
    name: string;
    url: string;
    src: string;
    bgColor: string;
    pageGroup: string;
  }) {
    if (payload.id) {
      const nextLinks = currentLinks.map((item) =>
        item.id === payload.id
          ? {
              ...item,
              name: payload.name,
              url: payload.url,
              src: payload.src,
              bgColor: payload.bgColor,
              pageGroup: payload.pageGroup
            }
          : item
      );
      await persistLinks(nextLinks);
      notify("标签已更新。", "success");
      return;
    }

    const nextLink = buildActionLink({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: payload.name,
      src: payload.src,
      url: payload.url,
      bgColor: payload.bgColor,
      pageGroup: payload.pageGroup,
      sort: currentLinks.length + 1
    });

    await persistLinks([...currentLinks, nextLink]);
    notify("标签已添加。", "success");
  }

  async function handleDeleteLink(linkId: string) {
    if (!window.confirm("确认删除这个标签吗？")) {
      return;
    }

    const nextLinks = currentLinks.filter((item) => item.id !== linkId && item.pid !== linkId);
    await persistLinks(nextLinks);
    notify("标签已删除。", "success");
  }

  async function handlePinToDock(link: HomeLink) {
    if (currentTabbar.some((item) => item.id === link.id)) {
      notify("该标签已经在 Dock 中。", "info");
      return;
    }

    const dockItem = {
      ...link,
      sort: currentTabbar.length
    };

    await persistTabbar([...currentTabbar, dockItem]);
    notify("已加入 Dock。", "success");
  }

  async function handleRemoveDockItem(linkId: string) {
    const nextTabbar = currentTabbar.filter((item) => item.id !== linkId);
    await persistTabbar(nextTabbar);
    notify("已移出 Dock。", "success");
  }

  async function handleSaveGroup(payload: { id?: string; name: string; src: string }) {
    if (payload.id) {
      const nextLinks = currentLinks.map((item) =>
        item.id === payload.id && item.type === "pageGroup"
          ? {
              ...item,
              name: payload.name,
              src: payload.src
            }
          : item
      );
      await persistLinks(nextLinks);
      notify("分组已更新。", "success");
      return;
    }

    const groupId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nextGroup = buildActionLink({
      id: groupId,
      name: payload.name,
      src: payload.src,
      url: "",
      type: "pageGroup",
      sort: currentLinks.length + 1
    });
    const nextAddTile = buildActionLink({
      id: `${groupId}-add`,
      name: "添加标签",
      src: "/static/addIco.png",
      url: "tab://addicon",
      bgColor: "rgba(255, 255, 255, 1)",
      pageGroup: groupId,
      sort: currentLinks.length + 2,
      tips: "添加标签"
    });

    await persistLinks([...currentLinks, nextGroup, nextAddTile]);
    notify("分组已创建。", "success");
  }

  async function handleDeleteGroup(groupId: string) {
    if (!window.confirm("确认删除这个分组吗？分组内标签会回到首页。")) {
      return;
    }

    const nextLinks = currentLinks
      .filter((item) => !(item.type === "pageGroup" && item.id === groupId))
      .filter((item) => !(item.url === "tab://addicon" && item.pageGroup === groupId))
      .map((item) =>
        item.pageGroup === groupId
          ? {
              ...item,
              pageGroup: ""
            }
          : item
      );

    await persistLinks(nextLinks);
    if (activeGroupId === groupId) {
      setActiveGroupId("");
    }
    notify("分组已删除。", "success");
  }

  async function handleReorderVisibleTiles(sourceId: string, targetId: string) {
    if (!sourceId || !targetId || sourceId === targetId) {
      return;
    }

    const visibleTiles = buildVisibleTiles(currentLinks, activeGroupId);
    const orderedIds = visibleTiles.map((item) => item.id);
    const sourceIndex = orderedIds.indexOf(sourceId);
    const targetIndex = orderedIds.indexOf(targetId);

    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }

    const nextOrderedIds = [...orderedIds];
    const [source] = nextOrderedIds.splice(sourceIndex, 1);
    nextOrderedIds.splice(targetIndex, 0, source);

    const sortMap = new Map(nextOrderedIds.map((id, index) => [id, index]));
    const nextLinks = currentLinks.map((item) =>
      sortMap.has(item.id)
        ? {
            ...item,
            sort: sortMap.get(item.id) ?? item.sort
          }
        : item
    );

    await persistLinks(nextLinks);
  }

  async function handleReorderDock(sourceId: string, targetId: string) {
    if (!sourceId || !targetId || sourceId === targetId) {
      return;
    }

    const orderedIds = currentTabbar.map((item) => item.id);
    const sourceIndex = orderedIds.indexOf(sourceId);
    const targetIndex = orderedIds.indexOf(targetId);

    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }

    const nextOrderedIds = [...orderedIds];
    const [source] = nextOrderedIds.splice(sourceIndex, 1);
    nextOrderedIds.splice(targetIndex, 0, source);

    const sortMap = new Map(nextOrderedIds.map((id, index) => [id, index]));
    const nextTabbar = currentTabbar.map((item) => ({
      ...item,
      sort: sortMap.get(item.id) ?? item.sort
    }));

    await persistTabbar(nextTabbar);
  }

  function handleEditGroup(groupId: string) {
    setGroupManagerInitialId(groupId);
    setGroupManagerOpen(true);
  }

  async function handleApplyBackground(backgroundUrl: string) {
    const nextConfig = mergeHomeConfig(currentConfig, {
      theme: {
        backgroundImage: backgroundUrl
      }
    });

    setCurrentConfig(nextConfig);

    if (data.user) {
      await requestLegacy<unknown>("/config/update", {
        method: "POST",
        data: { config: nextConfig }
      });
    } else {
      window.localStorage.setItem(LOCAL_HOME_CONFIG_STORAGE_KEY, JSON.stringify(nextConfig));
    }

    notify("壁纸已更新。", "success");
  }

  function handleActionTileClick(link: HomeLink) {
    if (link.url === "tab://addicon") {
      setEditingLink(null);
      setLinkEditorOpen(true);
      return;
    }

    if (link.url === "tab://background") {
      setBackgroundOpen(true);
      return;
    }

    if (link.url === "tab://setting") {
      setSettingsOpen(true);
    }
  }

  const tiles = buildVisibleTiles(currentLinks, activeGroupId);
  const folder = openFolderId ? currentLinks.find((item) => item.id === openFolderId) ?? null : null;
  const folderChildren = folder ? buildFolderChildren(currentLinks, folder.id) : [];
  const dockLinks = normalizeTabbarOrder(currentTabbar).slice(0, 9);
  const compactMode = currentConfig.theme.CompactMode;
  const currentPageGroups = normalizeLinksOrder(
    currentLinks.filter((item) => item.type === "pageGroup")
  );

  const cssVariables = {
    "--icon-size": `${currentConfig.theme.iconWidth}px`,
    "--icon-radius": `${currentConfig.theme.iconRadius}px`,
    "--name-color": currentConfig.theme.nameColor
  } as CSSProperties;

  return (
    <div className={styles.page} style={cssVariables}>
      <div
        className={styles.background}
        style={{
          backgroundImage: `url("${currentConfig.theme.backgroundImage}")`,
          filter: `blur(${currentConfig.theme.blur}px)`
        }}
      />
      <div className={styles.scrim} />

      <div className={styles.shell}>
        <HomeToastViewport items={toasts} onDismiss={dismissToast} />
        {!compactMode ? (
          <Sidebar
            data={{ ...data, pageGroups: currentPageGroups }}
            pageGroups={currentPageGroups}
            activeGroupId={activeGroupId}
            editMode={editMode}
            onSelectGroup={setActiveGroupId}
            onOpenGroupManager={() => {
              setGroupManagerInitialId("");
              setGroupManagerOpen(true);
            }}
            onEditGroup={handleEditGroup}
            onDeleteGroup={(groupId) => {
              void handleDeleteGroup(groupId);
            }}
          />
        ) : null}

        <Toolbar
          compactMode={compactMode}
          editMode={editMode}
          onToggleCompact={() =>
            setCurrentConfig((config) =>
              mergeHomeConfig(config, {
                theme: {
                  CompactMode: !config.theme.CompactMode
                }
              })
            )
          }
          legacyUrl={data.legacyUrl}
          user={data.user}
          onOpenAuth={() => setAuthOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleEditMode={() => setEditMode((current) => !current)}
          onNotify={notify}
        />

        <main className={styles.main}>
          <section className={compactMode ? `${styles.hero} ${styles.heroCompact}` : styles.hero}>
            {noticeOpen && data.notice ? (
              <NoticeBanner
                title={data.notice.title}
                message={data.notice.message}
                onClose={() => setNoticeOpen(false)}
              />
            ) : null}
            <ClockPanel theme={currentConfig.theme} />
            {currentConfig.openType.searchStatus ? (
              <SearchBar
                engines={data.searchEngines}
                searchOpen={currentConfig.openType.searchOpen}
              />
            ) : null}
          </section>

          {!compactMode ? (
            <section className={styles.content}>
              {tiles.length > 0 ? (
                <div className={styles.grid}>
                  {tiles.map((item) => {
                    const isDragging = draggingTileId === item.id;
                    const isDropTarget = dropTargetId === item.id && draggingTileId !== item.id;
                    const dragHandlers = editMode
                      ? {
                          onDragStart: () => setDraggingTileId(item.id),
                          onDragEnter: () => setDropTargetId(item.id),
                          onDrop: () => {
                            const sourceId = draggingTileId;
                            setDraggingTileId("");
                            setDropTargetId("");
                            void handleReorderVisibleTiles(sourceId, item.id);
                          },
                          onDragEnd: () => {
                            setDraggingTileId("");
                            setDropTargetId("");
                          }
                        }
                      : {
                          onDragStart: undefined,
                          onDragEnter: undefined,
                          onDrop: undefined,
                          onDragEnd: undefined
                        };

                    if (item.type === "component" && item.component === "iconGroup") {
                      return (
                        <FolderTile
                          key={item.id}
                          link={item}
                          children={buildFolderChildren(currentLinks, item.id)}
                          onOpen={() => setOpenFolderId(item.id)}
                          editMode={editMode}
                          isDragging={isDragging}
                          isDropTarget={isDropTarget}
                          onDragStart={dragHandlers.onDragStart}
                          onDragEnter={dragHandlers.onDragEnter}
                          onDrop={dragHandlers.onDrop}
                          onDragEnd={dragHandlers.onDragEnd}
                        />
                      );
                    }

                    if (isActionTile(item)) {
                      return (
                        <ActionTile
                          key={item.id}
                          link={item}
                          editMode={editMode}
                          isDragging={isDragging}
                          isDropTarget={isDropTarget}
                          onClick={() => handleActionTileClick(item)}
                          onDragStart={dragHandlers.onDragStart}
                          onDragEnter={dragHandlers.onDragEnter}
                          onDrop={dragHandlers.onDrop}
                          onDragEnd={dragHandlers.onDragEnd}
                        />
                      );
                    }

                    return (
                      <IconTile
                        key={item.id}
                        link={item}
                        openInBlank={currentConfig.openType.linkOpen}
                        editMode={editMode}
                        isDragging={isDragging}
                        isDropTarget={isDropTarget}
                        onEdit={
                          canEditTile(item)
                            ? () => {
                                setEditingLink(item);
                                setLinkEditorOpen(true);
                              }
                            : undefined
                        }
                        onDelete={
                          canEditTile(item)
                            ? () => {
                                void handleDeleteLink(item.id);
                              }
                            : undefined
                        }
                        onPin={
                          canEditTile(item) && currentConfig.theme.tabbar
                            ? () => {
                                void handlePinToDock(item);
                              }
                            : undefined
                        }
                        onDragStart={dragHandlers.onDragStart}
                        onDragEnter={dragHandlers.onDragEnter}
                        onDrop={dragHandlers.onDrop}
                        onDragEnd={dragHandlers.onDragEnd}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className={styles.emptyState}>当前分组下没有可展示的导航项。</div>
              )}
            </section>
          ) : null}
        </main>

        {!compactMode && currentConfig.theme.tabbar ? (
          <Dock
            links={dockLinks}
            openInBlank={currentConfig.openType.linkOpen}
            editMode={editMode}
            draggingDockId={draggingDockId}
            dockDropTargetId={dockDropTargetId}
            onRemove={(linkId) => {
              void handleRemoveDockItem(linkId);
            }}
            onDragStart={(linkId) => setDraggingDockId(linkId)}
            onDragEnter={(linkId) => setDockDropTargetId(linkId)}
            onDrop={(linkId) => {
              const sourceId = draggingDockId;
              setDraggingDockId("");
              setDockDropTargetId("");
              void handleReorderDock(sourceId, linkId);
            }}
            onDragEnd={() => {
              setDraggingDockId("");
              setDockDropTargetId("");
            }}
          />
        ) : null}
        <RecordBar site={data.site} />

        {folder ? (
          <FolderModal
            folder={folder}
            items={folderChildren}
            openInBlank={currentConfig.openType.linkOpen}
            onClose={() => setOpenFolderId("")}
          />
        ) : null}
        <AuthDialog
          open={authOpen}
          site={data.site}
          onClose={() => setAuthOpen(false)}
          onNotify={notify}
        />
        <HomeSettingsDialog
          open={settingsOpen}
          config={currentConfig}
          site={data.site}
          saving={settingsSaving}
          loggedIn={Boolean(data.user)}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSaveSettings}
          onConfigChange={setCurrentConfig}
        />
        <AddLinkDialog
          open={linkEditorOpen}
          mode={editingLink ? "edit" : "create"}
          activeGroupId={activeGroupId}
          pageGroups={currentPageGroups}
          initialLink={editingLink}
          onClose={() => {
            setLinkEditorOpen(false);
            setEditingLink(null);
          }}
          onSave={handleSaveLink}
        />
        <BackgroundDialog
          open={backgroundOpen}
          currentBackground={currentConfig.theme.backgroundImage}
          onClose={() => setBackgroundOpen(false)}
          onApply={handleApplyBackground}
        />
        <PageGroupManagerDialog
          open={groupManagerOpen}
          pageGroups={currentPageGroups}
          initialGroupId={groupManagerInitialId}
          onClose={() => {
            setGroupManagerOpen(false);
            setGroupManagerInitialId("");
          }}
          onSave={handleSaveGroup}
          onDelete={handleDeleteGroup}
        />
      </div>
    </div>
  );
}
