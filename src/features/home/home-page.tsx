"use client";

import type { CSSProperties, FormEvent, MouseEvent as ReactMouseEvent } from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { HomeConfig, HomeData, HomeLink, HomeSearchEngine, HomeTheme } from "@/server/home/types";
import { AddLinkDialog, BackgroundDialog, buildActionLink } from "./home-actions";
import { AuthDialog, UserMenu } from "./home-auth";
import { HomeProfileDialog } from "./home-profile-dialog";
import { BdLogo } from "./bd-logo";
import {
  buildFolderChildren as buildFolderChildrenModel,
  buildVisibleHomeCards,
  canEditHomeCard,
  getHomeActionCardType,
  getNextFolderSort as getNextFolderSortModel,
  getNextRootSort as getNextRootSortModel,
  isActionHomeCard,
  isAppHomeCard,
  isFolderHomeCard,
  isPluginHomeCard,
  isRenderableHomeCard,
  isSpecialHomeCardLink,
  isTextHomeCard,
  normalizeHomeLinksOrder,
  resolveHomeCardLabel,
  resolveHomeGroupId as resolveHomeGroupIdModel
} from "./home-card-model";
import { requestLegacy } from "./home-client";
import { PageManagerDialog } from "./home-page-manager";
import { HomeSettingsDialog } from "./home-settings";
import { HomeToastViewport, type HomeToastItem, type HomeToastTone } from "./home-toast";
import { usePressAndHold } from "./use-press-and-hold";
import styles from "./home-page.module.css";

const LOCAL_HOME_CONFIG_STORAGE_KEY = "config";
const SEARCH_ENGINE_STORAGE_KEY = "SearchEngineLocal";
const SEARCH_HISTORY_STORAGE_KEY = "bendy.home.search-history";
const SEARCH_HISTORY_ENABLED_STORAGE_KEY = "searchHistory";
const LOCAL_HOME_LINK_STORAGE_KEY = "link";
const LOCAL_HOME_TABBAR_STORAGE_KEY = "tabbar";
const PAGE_GROUP_STORAGE_KEY = "bendy.home.page-group";
const HOME_SNAPSHOT_STORAGE_KEY = "bendy.home.snapshots";

type HomePageProps = {
  data: HomeData;
};

type TimeState = {
  value: string;
  meta: string[];
};

type ContextMenuState = {
  open: boolean;
  x: number;
  y: number;
};

type TileContextMenuState = ContextMenuState & {
  linkId: string;
};

type HomeSnapshot = {
  id: string;
  createdAt: string;
  config: HomeConfig;
  links: HomeLink[];
  tabbar: HomeLink[];
  activeGroupId: string;
};

type LegacySearchEngineRow = {
  id: number;
  name: string;
  icon: string;
  url: string;
  tips: string;
};

const CLOSED_CONTEXT_MENU: ContextMenuState = {
  open: false,
  x: 0,
  y: 0
};

const CLOSED_TILE_CONTEXT_MENU: TileContextMenuState = {
  open: false,
  x: 0,
  y: 0,
  linkId: ""
};

const DESKTOP_CONTEXT_MENU_WIDTH = 140;
const DESKTOP_CONTEXT_MENU_HEIGHT = 248;
const TILE_CONTEXT_MENU_WIDTH = 150;
const TILE_CONTEXT_MENU_HEIGHT = 188;

const WEEKDAY_LABELS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

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

function padTimeSegment(value: number) {
  return String(value).padStart(2, "0");
}

function formatClockValue(date: Date, theme: HomeTheme) {
  const hours = date.getHours();
  const minutes = padTimeSegment(date.getMinutes());
  const seconds = padTimeSegment(date.getSeconds());

  if (theme.time24) {
    return theme.timeSecond ? `${padTimeSegment(hours)}:${minutes}:${seconds}` : `${padTimeSegment(hours)}:${minutes}`;
  }

  const hour12 = hours % 12 || 12;
  return theme.timeSecond ? `${hour12}:${minutes}:${seconds}` : `${hour12}:${minutes}`;
}

function formatMonthDay(date: Date) {
  return `${padTimeSegment(date.getMonth() + 1)}月${padTimeSegment(date.getDate())}日`;
}

function buildTimeState(theme: HomeTheme, date: Date): TimeState {
  const value = formatClockValue(date, theme);

  const meta: string[] = [];
  if (theme.timeMonthDay) {
    meta.push(formatMonthDay(date));
  }

  if (theme.timeWeek) {
    meta.push(WEEKDAY_LABELS[date.getDay()] ?? "");
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
      return { column: 2, row: 1 };
    case "2x2":
      return { column: 2, row: 2 };
    case "2x4":
      return { column: 4, row: 2 };
    default:
      return { column: 1, row: 1 };
  }
}

function getGridColumnCount(
  viewportWidth: number,
  iconSize: number,
  gap: number,
  maxColumns: number,
  hasSidebar: boolean
) {
  const horizontalPadding = hasSidebar ? 220 : 96;
  const availableWidth = Math.max(320, viewportWidth - horizontalPadding);
  const columns = Math.floor((availableWidth + gap) / (iconSize + gap));
  return Math.max(3, Math.min(maxColumns, columns));
}

function reorderIdList(order: string[], sourceId: string, targetId: string) {
  if (!sourceId || !targetId || sourceId === targetId) {
    return order;
  }

  const sourceIndex = order.indexOf(sourceId);
  const targetIndex = order.indexOf(targetId);
  if (sourceIndex < 0 || targetIndex < 0) {
    return order;
  }

  const nextOrder = [...order];
  const [source] = nextOrder.splice(sourceIndex, 1);
  nextOrder.splice(targetIndex, 0, source);
  return nextOrder;
}

function buildOrderedItems<T extends { id: string }>(items: T[], previewIds: string[] | null) {
  if (!previewIds || previewIds.length === 0) {
    return items;
  }

  const itemMap = new Map(items.map((item) => [item.id, item] as const));
  const orderedItems = previewIds
    .map((id) => itemMap.get(id))
    .filter((item): item is T => Boolean(item));

  return orderedItems.length === items.length ? orderedItems : items;
}

function useFlipLayout(keys: string[]) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const previousRectsRef = useRef<Map<string, DOMRect>>(new Map());

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    const nextRects = new Map<string, DOMRect>();
    const elementMap = new Map<string, HTMLElement>();
    const elements = Array.from(root.querySelectorAll<HTMLElement>("[data-flip-key]"));

    for (const element of elements) {
      const key = element.dataset.flipKey;
      if (!key) {
        continue;
      }

      nextRects.set(key, element.getBoundingClientRect());
      elementMap.set(key, element);
    }

    for (const [key, nextRect] of nextRects) {
      const previousRect = previousRectsRef.current.get(key);
      const element = elementMap.get(key);
      if (!previousRect || !element) {
        continue;
      }

      const deltaX = previousRect.left - nextRect.left;
      const deltaY = previousRect.top - nextRect.top;
      if (Math.abs(deltaX) < 1 && Math.abs(deltaY) < 1) {
        continue;
      }

      element.animate(
        [
          { transform: `translate(${deltaX}px, ${deltaY}px)` },
          { transform: "translate(0, 0)" }
        ],
        {
          duration: 220,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)"
        }
      );
    }

    previousRectsRef.current = nextRects;
  }, [keys]);

  return rootRef;
}

function isSpecialLegacyLink(link: HomeLink): boolean {
  return isSpecialHomeCardLink(link);
}

function isTextIcon(link: HomeLink): boolean {
  return isTextHomeCard(link);
}

function isAppLink(link: HomeLink): boolean {
  return isAppHomeCard(link);
}

function isFolderLink(link: HomeLink): boolean {
  return isFolderHomeCard(link);
}

function isPluginCard(link: HomeLink): boolean {
  return isPluginHomeCard(link);
}

function isRenderableTile(link: HomeLink): boolean {
  return isRenderableHomeCard(link);
}

function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function maybeParseJson<T>(input: unknown, fallback: T): T {
  if (input === null || input === undefined) {
    return fallback;
  }

  if (typeof input === "object") {
    return input as T;
  }

  if (typeof input !== "string") {
    return fallback;
  }

  try {
    return JSON.parse(input) as T;
  } catch {
    return fallback;
  }
}

function toStringValue(input: unknown, fallback = ""): string {
  if (input === null || input === undefined) {
    return fallback;
  }

  return String(input);
}

function normalizeLinksInput(input: unknown): HomeLink[] {
  const list = Array.isArray(input) ? input : [];
  return list
    .filter((item): item is HomeLink => Boolean(item && typeof item === "object" && "id" in item))
    .map((item) => ({
      ...item,
      pageType: item.pageType === "geek" ? "geek" : "normal"
    }));
}

function resolveTileLabel(link: HomeLink): string {
  return link.name || link.tips || link.url || "未命名";
}

function isInternalLink(url: string): boolean {
  return url.startsWith("/");
}

function buildSidebarLinks(data: HomeData) {
  const homeGroup = data.pageGroups.find((group) => resolveTileLabel(group) === "首页") ?? null;
  const dynamicGroups = data.pageGroups
    .filter((group) => group.id !== homeGroup?.id)
    .map((group) => ({
      type: "group" as const,
      id: group.id,
      label: resolveTileLabel(group),
      icon: group.src || "/static/pageGroup/home.svg"
    }));

  if (homeGroup) {
    return [
      {
        type: "group" as const,
        id: homeGroup.id,
        label: "首页",
        icon: homeGroup.src || "/static/pageGroup/home.svg"
      },
      ...dynamicGroups
    ];
  }

  return [
    {
      type: "group" as const,
      id: "",
      label: "首页",
      icon: "/static/pageGroup/home.svg"
    },
    ...dynamicGroups
  ];
}

function resolveHomeGroupId(links: HomeLink[]) {
  const homeGroup = links.find((item) => item.type === "pageGroup" && resolveTileLabel(item) === "首页");
  return homeGroup?.id ?? "";
}

function buildRootTiles(data: HomeData, activeGroupId: string, homeGroupId = "") {
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

    if (homeGroupId) {
      return !item.pageGroup || item.pageGroup === homeGroupId;
    }

    return !item.pageGroup;
  });
}

function isActionTile(link: HomeLink): boolean {
  return isActionHomeCard(link) || getHomeActionCardType(link) !== null;
}

function buildVisibleTiles(links: HomeLink[], activeGroupId: string, homeGroupId = "") {
  return buildVisibleHomeCards(links, activeGroupId, homeGroupId);
}

function normalizeLinksOrder(links: HomeLink[]) {
  return normalizeHomeLinksOrder(links);
}

function canEditTile(link: HomeLink) {
  return canEditHomeCard(link);
}

function buildFolderChildren(links: HomeLink[], folderId: string) {
  return buildFolderChildrenModel(links, folderId);
}

function getNextFolderSort(links: HomeLink[], folderId: string) {
  return getNextFolderSortModel(links, folderId);
}

function getNextRootSort(links: HomeLink[], groupId: string, homeGroupId = "") {
  return getNextRootSortModel(links, groupId, homeGroupId);
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
    background: link.bgColor || "var(--default-icon-background)"
  };
}

function clampContextMenuPosition(x: number, y: number, width: number, height: number) {
  if (typeof window === "undefined") {
    return { x, y };
  }

  return {
    x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
    y: Math.max(8, Math.min(y, window.innerHeight - height - 8))
  };
}

function normalizeSearchEngineKey(name: string, id: number) {
  const normalized = name.trim().toLowerCase();

  if (normalized.includes("bing") || normalized.includes("必应")) {
    return "bing";
  }

  if (normalized.includes("百度")) {
    return "baidu";
  }

  if (normalized.includes("google")) {
    return "google";
  }

  if (normalized.includes("duckduckgo")) {
    return "duckduckgo";
  }

  if (normalized.includes("360") || normalized.includes("haosou")) {
    return "duckduckgo";
  }

  return `legacy-${id}`;
}

function mapLegacySearchEngine(row: LegacySearchEngineRow): HomeSearchEngine | null {
  const url = row.url.trim();
  if (!url) {
    return null;
  }

  if (row.name.includes("360") || url.includes("so.com") || url.includes("haosou.com")) {
    return {
      key: "duckduckgo",
      name: "DuckDuckGo",
      icon: "/static/searchEngine/DuckDuckGo.svg",
      action: "https://duckduckgo.com/",
      queryParam: "q"
    };
  }

  const placeholderIndex = url.indexOf("{1}");
  if (placeholderIndex < 0) {
    return null;
  }

  const [baseUrl, queryString = ""] = url.split("?", 2);
  const params = new URLSearchParams(queryString);
  let queryParam = "";

  params.forEach((value, key) => {
    if (!queryParam && value.includes("{1}")) {
      queryParam = key;
    }
  });

  if (!queryParam) {
    return null;
  }

  return {
    key: normalizeSearchEngineKey(row.name, row.id),
    name: row.name,
    icon: row.icon,
    action: baseUrl,
    queryParam
  };
}

function getFolderPreviewLimit(size: string) {
  switch (size) {
    case "2x2":
    case "2x4":
      return 8;
    default:
      return 4;
  }
}

function getFolderGridClassName(size: string) {
  switch (size) {
    case "1x2":
      return `${styles.folderGrid} ${styles.folderGridStrip}`;
    case "2x2":
      return `${styles.folderGrid} ${styles.folderGridLarge}`;
    case "2x4":
      return `${styles.folderGrid} ${styles.folderGridWide}`;
    default:
      return `${styles.folderGrid} ${styles.folderGridCompact}`;
  }
}

function getFolderCardClassName(size: string) {
  return size === "2x4" ? `${styles.folderCard} ${styles.folderCardWide}` : styles.folderCard;
}

function Sidebar({
  data,
  pageGroups,
  activeGroupId,
  position,
  autoHide,
  editMode,
  user,
  onOpenAuth,
  onSelectGroup,
  onOpenGroupManager,
  onOpenSettings,
  onEditGroup,
  onDeleteGroup,
  onNotify,
  onOpenProfile
}: {
  data: HomeData;
  pageGroups: HomeLink[];
  activeGroupId: string;
  position: "right" | "bottom";
  autoHide: boolean;
  editMode: boolean;
  user: HomeData["user"];
  onOpenAuth: () => void;
  onSelectGroup: (groupId: string) => void;
  onOpenGroupManager: () => void;
  onOpenSettings: () => void;
  onEditGroup: (groupId: string) => void;
  onDeleteGroup: (groupId: string) => void;
  onNotify: (message: string, tone?: HomeToastTone) => void;
  onOpenProfile?: () => void;
}) {
  const sidebarLinks = buildSidebarLinks({
    ...data,
    pageGroups
  });

  return (
    <aside className={[
      styles.sidebar,
      position === "right" ? styles.sidebarRight : "",
      position === "bottom" ? styles.sidebarBottom : "",
      autoHide ? styles.sidebarAutoHide : ""
    ].filter(Boolean).join(" ")}>
      <div className={styles.sidebarGroup}>
        <div className={styles.sidebarProfile}>
          {user ? (
            <UserMenu user={user} legacyUrl="" onNotify={onNotify} onOpenProfile={onOpenProfile} position={position} />
          ) : (
            <button
              className={styles.userButton}
              type="button"
              onClick={onOpenAuth}
              title="登录"
              aria-label="登录"
            >
              <BdLogo size="md" />
              <span className={styles.userButtonText}>登录</span>
            </button>
          )}
        </div>
        {sidebarLinks.map((item) => {
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
                    aria-label={`编辑页面 ${item.label}`}
                  >
                    ✎
                  </button>
                  <button
                    className={styles.sidebarRowDelete}
                    type="button"
                    onClick={() => onDeleteGroup(item.id)}
                    aria-label={`删除页面 ${item.label}`}
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
        })}
        <button
          className={styles.sidebarLink}
          type="button"
          onClick={onOpenGroupManager}
          title={editMode ? "页面管理" : "新增页面"}
          aria-label={editMode ? "页面管理" : "新增页面"}
        >
          <img className={styles.sidebarIcon} src="/icons/add.svg" alt="" />
          <span className={styles.sidebarText}>页面</span>
        </button>
      </div>
      <div className={`${styles.sidebarGroup} ${styles.sidebarFooter}`}>
        <button
          className={styles.sidebarFooterButton}
          type="button"
          onMouseDown={onOpenSettings}
          onClick={onOpenSettings}
          title="打开设置中心"
          aria-label="打开设置中心"
        >
          <img className={styles.sidebarFooterIcon} src="/icons/setting.svg" alt="" />
        </button>
      </div>
    </aside>
  );
}

function Toolbar({
  compactMode,
  editMode,
  sidebarOnRight,
  onToggleCompact,
  user,
  onOpenAuth,
  onOpenSettings,
  onToggleEditMode,
  onNotify
}: {
  compactMode: boolean;
  editMode: boolean;
  sidebarOnRight: boolean;
  onToggleCompact: () => void;
  user: HomeData["user"];
  onOpenAuth: () => void;
  onOpenSettings: () => void;
  onToggleEditMode: () => void;
  onNotify: (message: string, tone?: HomeToastTone) => void;
}) {
  const loggedIn = Boolean(user);
  void onOpenAuth;
  void onNotify;

  return (
    <div
      className={[
        styles.toolbar,
        sidebarOnRight ? styles.toolbarWithSidebarRight : "",
        compactMode ? styles.toolbarCompact : "",
        editMode ? styles.toolbarEditing : styles.toolbarIdle
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {!loggedIn ? (
        <button
          className={styles.userButton}
          type="button"
          onClick={onOpenAuth}
          title="登录"
          aria-label="登录"
        >
          <BdLogo size="md" />
          <span className={styles.userButtonText}>登录</span>
        </button>
      ) : null}
      {!loggedIn ? (
        <button
          className={styles.toolbarButton}
          type="button"
          onClick={onOpenSettings}
          title="打开设置中心"
          aria-label="打开设置中心"
        >
          <img src="/icons/setting.svg" alt="" />
        </button>
      ) : null}
      {editMode ? (
        <button
          className={styles.toolbarButton}
          type="button"
          onClick={onToggleEditMode}
          title="退出编辑模式"
          aria-label="退出编辑模式"
        >
          <img src="/icons/edit.svg" alt="" />
        </button>
      ) : null}
      <button
        className={styles.toolbarButton}
        type="button"
        onClick={onToggleCompact}
        title={compactMode ? "切换到标准模式" : "切换到简洁模式"}
      >
        <img
          src={
            compactMode
              ? "/icons/apps.svg"
              : "/icons/light.svg"
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
      <div className={styles.timeValue} suppressHydrationWarning>
        {clock.value}
      </div>
      <div className={styles.timeMeta} suppressHydrationWarning>
        {clock.meta.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </div>
  );
}

function SearchBar({
  engines,
  searchOpen,
  searchRecommend,
  searchLink,
  historyEnabled,
  quickLinks,
  compactMode
}: {
  engines: HomeSearchEngine[];
  searchOpen: boolean;
  searchRecommend: boolean;
  searchLink: boolean;
  historyEnabled: boolean;
  quickLinks: HomeLink[];
  compactMode: boolean;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [availableEngines, setAvailableEngines] = useState<HomeSearchEngine[]>(engines);
  const [engineIndex, setEngineIndex] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    setAvailableEngines(engines);
  }, [engines]);

  useEffect(() => {
    let cancelled = false;

    async function loadSearchEngines() {
      try {
        const response = await requestLegacy<LegacySearchEngineRow[]>("/searchengine/searchengine");
        if (cancelled || !Array.isArray(response.data)) {
          return;
        }

        const mapped = response.data.map(mapLegacySearchEngine).filter((item): item is HomeSearchEngine => item !== null);
        if (mapped.length > 0) {
          setAvailableEngines(
            mapped.filter((engine, index, list) => list.findIndex((item) => item.key === engine.key) === index)
          );
        }
      } catch {
        // keep fallback engines
      }
    }

    void loadSearchEngines();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const storedKey = window.localStorage.getItem(SEARCH_ENGINE_STORAGE_KEY);
    if (!storedKey) {
    }

    const nextIndex = availableEngines.findIndex((engine) => engine.key === storedKey);
    if (nextIndex >= 0) {
      setEngineIndex(nextIndex);
    }
  }, [availableEngines]);

  useEffect(() => {
    window.localStorage.setItem(
      SEARCH_ENGINE_STORAGE_KEY,
      availableEngines[engineIndex]?.key ?? availableEngines[0]?.key ?? "bing"
    );
  }, [availableEngines, engineIndex]);

  useEffect(() => {
    if (!historyEnabled) {
      setHistory([]);
      return;
    }

    const raw = window.localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY);
    if (!raw) {
      setHistory([]);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) {
        setHistory(parsed.filter((item) => typeof item === "string" && item.trim()).slice(0, 10));
      }
    } catch {
      // ignore invalid local history
    }
  }, [historyEnabled]);

  useEffect(() => {
    if (!panelOpen) {
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (rootRef.current?.contains(target)) {
        return;
      }

      setPanelOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPanelOpen(false);
      }
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [panelOpen]);

  const currentEngine = availableEngines[engineIndex] ?? availableEngines[0];
  const normalizedQuery = query.trim().toLowerCase();
  const iconResults =
    normalizedQuery && searchLink
      ? quickLinks
          .filter((item) => resolveTileLabel(item).toLowerCase().includes(normalizedQuery))
          .slice(0, 8)
      : [];
  const recommendWords =
    searchRecommend && !normalizedQuery
      ? [...quickLinks]
          .sort((left, right) => {
            const leftPreferred = resolveTileLabel(left) === "笨迪导航" ? -1 : 0;
            const rightPreferred = resolveTileLabel(right) === "笨迪导航" ? -1 : 0;
            return leftPreferred - rightPreferred;
          })
          .map((item) => resolveTileLabel(item))
          .filter((item, index, list) => Boolean(item) && list.indexOf(item) === index)
          .slice(0, 8)
      : [];

  function persistHistory(nextHistory: string[]) {
    if (!historyEnabled) {
      window.localStorage.removeItem(SEARCH_HISTORY_STORAGE_KEY);
      setHistory([]);
      return;
    }

    setHistory(nextHistory);
    window.localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(nextHistory));
  }

  function rememberKeyword(keyword: string) {
    const normalized = keyword.trim();
    if (!normalized) {
    }

    const nextHistory = [normalized, ...history.filter((item) => item !== normalized)].slice(0, 10);
    persistHistory(nextHistory);
  }

  function searchKeyword(keyword: string) {
    const normalized = keyword.trim();
    if (!normalized) {
    }

    rememberKeyword(normalized);
    const url = new URL(currentEngine.action);
    url.searchParams.set(currentEngine.queryParam, normalized);
    window.open(url.toString(), searchOpen ? "_blank" : "_self", "noopener,noreferrer");
  }

  function openQuickLink(link: HomeLink) {
    const target = searchOpen && !isInternalLink(link.url) ? "_blank" : "_self";
    const rel = target === "_blank" ? "noreferrer" : undefined;
    window.open(link.url, target, rel ? "noopener,noreferrer" : "noopener");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    searchKeyword(query);
  }

  const searchPanelContent = panelOpen ? (
    <div className={styles.searchPanel}>
      {availableEngines.length > 1 ? (
        <div className={styles.searchPanelSection}>
          <div className={styles.searchPanelTitle}>搜索引擎</div>
          <div className={styles.searchEngineGrid}>
            {availableEngines.map((engine, index) => (
              <button
                key={engine.key}
                className={
                  index === engineIndex
                    ? `${styles.searchEngineGridItem} ${styles.searchEngineGridItemActive}`
                    : styles.searchEngineGridItem
                }
                type="button"
                onClick={() => setEngineIndex(index)}
              >
                <img src={engine.icon} alt="" />
                <span>{engine.name}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {query.trim() && searchRecommend ? (
        <div className={styles.searchPanelSection}>
          <div className={styles.searchPanelTitle}>快捷搜索</div>
          <button className={styles.searchPanelItem} type="button" onClick={() => searchKeyword(query)}>
            使用 {currentEngine.name} 搜索 “{query.trim()}”
          </button>
        </div>
      ) : null}
      {iconResults.length > 0 ? (
        <div className={styles.searchPanelSection}>
          <div className={styles.searchPanelTitle}>图标搜索结果</div>
          <div className={styles.searchIconResultList}>
            {iconResults.map((link) => (
              <button
                key={link.id}
                className={styles.searchIconResultItem}
                type="button"
                onClick={() => openQuickLink(link)}
              >
                {isTextIcon(link) ? (
                  <span className={styles.searchIconResultText}>{link.src.replace(/^txt:/, "")}</span>
                ) : (
                  <img src={link.src} alt="" />
                )}
                <span>{resolveTileLabel(link)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {recommendWords.length > 0 ? (
        <div className={styles.searchPanelSection}>
          <div className={styles.searchPanelTitle}>推荐词</div>
          <div className={styles.searchHistoryList}>
            {recommendWords.map((item) => (
              <button
                key={item}
                className={styles.searchPanelItem}
                type="button"
                onClick={() => {
                  setQuery(item);
                  searchKeyword(item);
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {historyEnabled && history.length > 0 ? (
        <div className={styles.searchPanelSection}>
          <div className={styles.searchPanelTitle}>搜索历史</div>
          <div className={styles.searchHistoryList}>
            {history.map((item) => (
              <button
                key={item}
                className={styles.searchPanelItem}
                type="button"
                onClick={() => {
                  setQuery(item);
                  searchKeyword(item);
                }}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  ) : null;

  if (compactMode) {
    return (
      <div className={styles.searchBox} ref={rootRef}>
        <form className={`${styles.searchShell} ${styles.searchShellCompact}`} onSubmit={handleSubmit}>
          <button
            className={`${styles.searchEngineButton} ${styles.searchEngineButtonCompact}`}
            type="button"
            onClick={() => setPanelOpen((open) => !open)}
            title={`选择搜索引擎，当前为 ${currentEngine.name}`}
            aria-label={`选择搜索引擎，当前为 ${currentEngine.name}`}
          >
            <img src={currentEngine.icon} alt="" />
            <span className={styles.searchEngineCompactCaret} aria-hidden="true" />
          </button>
          <input
            className={styles.searchInput}
            name="keyword"
            value={query}
            onFocus={() => setPanelOpen(true)}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入并搜索..."
          />
          <button className={styles.searchSubmit} type="submit" aria-label="开始搜索">
            <img src="/icons/search.svg" alt="" />
          </button>
        </form>
        {searchPanelContent}
      </div>
    );
  }

  return (
    <div className={styles.searchBox} ref={rootRef}>
      <form className={styles.searchShell} onSubmit={handleSubmit}>
        <button
        className={styles.searchEngineButton}
        type="button"
        onClick={() => setPanelOpen((open) => !open)}
        title={`选择搜索引擎，当前为 ${currentEngine.name}`}
        aria-label={`选择搜索引擎，当前为 ${currentEngine.name}`}
      >
          <img src={currentEngine.icon} alt="" />
          <span className={styles.searchEngineLabel}>{currentEngine.name}</span>
          <span className={styles.searchEngineCompactCaret} aria-hidden="true" />
        </button>
        <input
          className={styles.searchInput}
          name="keyword"
          value={query}
          onFocus={() => setPanelOpen(true)}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="输入并搜索..."
        />
        <button className={styles.searchSubmit} type="submit" aria-label="开始搜索">
          <img src="/icons/search.svg" alt="" />
        </button>
      </form>
      {searchPanelContent}
    </div>
  );
}

function TileEditControls({
  onEdit,
  onDelete,
  onPin
}: {
  onEdit?: () => void;
  onDelete: () => void;
  onPin?: () => void;
}) {
  return (
    <div className={styles.tileEditActions}>
      {onPin ? (
        <button
          className={`${styles.tileEditButton} ${styles.tilePinButton}`}
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
      {onEdit ? (
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
      ) : null}
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
  isMergeTarget,
  onContextMenu,
  onEdit,
  onDelete,
  onPin,
  onLongPress,
  onDragStart,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragEnd,
  onOpenInlineWindow
}: {
  link: HomeLink;
  openInBlank: boolean;
  editMode: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  isMergeTarget?: boolean;
  onContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onPin?: () => void;
  onLongPress?: () => void;
  onDragStart?: () => void;
  onDragEnter?: () => void;
  onDragLeave?: () => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
  onOpenInlineWindow?: () => void;
}) {
  const label = resolveTileLabel(link);
  const target = openInBlank && !isInternalLink(link.url) ? "_blank" : "_self";
  const rel = target === "_blank" ? "noreferrer" : undefined;
  const tileClassName = [
    styles.tile,
    isDragging ? styles.tileDragging : "",
    isDropTarget ? styles.tileDropTarget : "",
    isMergeTarget ? styles.tileMergeTarget : ""
  ]
    .filter(Boolean)
    .join(" ");
  const hold = usePressAndHold({
    enabled: !editMode && Boolean(onLongPress),
    onLongPress: () => {
      onLongPress?.();
    }
  });

  return (
    <div
      data-home-tile="true"
      data-flip-key={link.id}
      className={tileClassName}
      style={getTileStyle(link)}
      draggable={editMode}
      onMouseDown={editMode ? undefined : (event) => hold.start(event.button)}
      onMouseUp={editMode ? undefined : hold.clear}
      onMouseLeave={editMode ? undefined : hold.clear}
      onTouchStart={editMode ? undefined : () => hold.start(0)}
      onTouchEnd={editMode ? undefined : hold.clear}
      onTouchCancel={editMode ? undefined : hold.clear}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu?.(event);
      }}
      onDragStart={editMode ? onDragStart : undefined}
      onDragEnter={editMode ? onDragEnter : undefined}
      onDragLeave={editMode ? onDragLeave : undefined}
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
        onClick={(event) => {
          if (hold.consumeClick()) {
            event.preventDefault();
            return;
          }

          if (editMode) {
            event.preventDefault();
            return;
          }

          if (isAppLink(link)) {
            event.preventDefault();
            onOpenInlineWindow?.();
          }
        }}
        style={getLinkSurfaceStyle(link)}
      >
        {isAppLink(link) ? (
          <span className={styles.tileAppBadge}>
            <img className={styles.tileAppBadgeIcon} src="/icons/wapp.svg" alt="" />
          </span>
        ) : null}
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

function InlineAppWindow({ link, onClose }: { link: HomeLink; onClose: () => void }) {
  const label = resolveTileLabel(link);
  const frameUrl =
    typeof link.custom?.window === "string" && link.custom.window.trim()
      ? link.custom.window.trim()
      : link.url;

  return (
    <div className={styles.inlineWindowLayer} role="dialog" aria-label={`${label} 内联窗口`}>
      <div className={styles.inlineWindow}>
        <div className={styles.inlineWindowHeader}>
          <div className={styles.inlineWindowTitle}>
            {isTextIcon(link) ? (
              <span className={styles.inlineWindowTextIcon}>{link.src.replace(/^txt:/, "")}</span>
            ) : (
              <img src={link.src} alt="" />
            )}
            <span>{label}</span>
          </div>
          <div className={styles.inlineWindowActions}>
            <a href={frameUrl} target="_blank" rel="noreferrer">
              新窗口打开
            </a>
            <button type="button" onClick={onClose} aria-label="关闭内联窗口">
              ×
            </button>
          </div>
        </div>
        <iframe className={styles.inlineWindowFrame} src={frameUrl} title={label} />
      </div>
    </div>
  );
}

function ActionTile({
  link,
  editMode,
  isDragging,
  isDropTarget,
  onContextMenu,
  onClick,
  onLongPress,
  onDragStart,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragEnd
}: {
  link: HomeLink;
  editMode: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onClick: () => void;
  onLongPress?: () => void;
  onDragStart?: () => void;
  onDragEnter?: () => void;
  onDragLeave?: () => void;
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
  const hold = usePressAndHold({
    enabled: !editMode && Boolean(onLongPress),
    onLongPress: () => {
      onLongPress?.();
    }
  });

  return (
    <div
      data-home-tile="true"
      data-flip-key={link.id}
      className={tileClassName}
      style={getTileStyle(link)}
      draggable={editMode}
      onMouseDown={editMode ? undefined : (event) => hold.start(event.button)}
      onMouseUp={editMode ? undefined : hold.clear}
      onMouseLeave={editMode ? undefined : hold.clear}
      onTouchStart={editMode ? undefined : () => hold.start(0)}
      onTouchEnd={editMode ? undefined : hold.clear}
      onTouchCancel={editMode ? undefined : hold.clear}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu?.(event);
      }}
      onDragStart={editMode ? onDragStart : undefined}
      onDragEnter={editMode ? onDragEnter : undefined}
      onDragLeave={editMode ? onDragLeave : undefined}
      onDragOver={editMode ? (event) => event.preventDefault() : undefined}
      onDrop={editMode ? onDrop : undefined}
      onDragEnd={editMode ? onDragEnd : undefined}
    >
      <button
        className={styles.tileAction}
        type="button"
        title={link.tips || label}
        onClick={() => {
          if (hold.consumeClick()) {
            return;
          }
          onClick();
        }}
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

function ComponentTile({
  link,
  editMode,
  isDragging,
  isDropTarget,
  isMergeTarget,
  onContextMenu,
  onLongPress,
  onOpenInlineWindow,
  onDelete,
  onDragStart,
  onDragEnter,
  onDragLeave,
  onDrop,
  onDragEnd
}: {
  link: HomeLink;
  editMode: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  isMergeTarget?: boolean;
  onContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onLongPress?: () => void;
  onOpenInlineWindow?: (link: HomeLink) => void;
  onDelete?: () => void;
  onDragStart?: () => void;
  onDragEnter?: () => void;
  onDragLeave?: () => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
}) {
  const tileClassName = [
    styles.tile,
    isDragging ? styles.tileDragging : "",
    isDropTarget ? styles.tileDropTarget : "",
    isMergeTarget ? styles.tileMergeTarget : ""
  ]
    .filter(Boolean)
    .join(" ");
  const hold = usePressAndHold({
    enabled: !editMode && Boolean(onLongPress),
    onLongPress: () => {
      onLongPress?.();
    }
  });

  return (
    <div
      data-home-tile="true"
      data-flip-key={link.id}
      className={tileClassName}
      style={getTileStyle(link)}
      draggable={editMode}
      onMouseDown={editMode ? undefined : (event) => hold.start(event.button)}
      onMouseUp={editMode ? undefined : hold.clear}
      onMouseLeave={editMode ? undefined : hold.clear}
      onTouchStart={editMode ? undefined : () => hold.start(0)}
      onTouchEnd={editMode ? undefined : hold.clear}
      onTouchCancel={editMode ? undefined : hold.clear}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu?.(event);
      }}
      onDragStart={editMode ? onDragStart : undefined}
      onDragEnter={editMode ? onDragEnter : undefined}
      onDragLeave={editMode ? onDragLeave : undefined}
      onDragOver={editMode ? (event) => event.preventDefault() : undefined}
      onDrop={editMode ? onDrop : undefined}
      onDragEnd={editMode ? onDragEnd : undefined}
    >
      {editMode && onDelete ? <TileEditControls onDelete={onDelete} /> : null}
      <button
        className={`${styles.tileAction} ${styles.componentTileAction}`}
        type="button"
        title={resolveTileLabel(link)}
        onClick={() => {
          if (hold.consumeClick()) {
            return;
          }
          if (!editMode) {
            onOpenInlineWindow?.(link);
          }
        }}
      >
        {(() => {
          const frameUrl = typeof link.url === "string" ? link.url.trim() : "";
          const isSafeFrame = /^https?:\/\//i.test(frameUrl) || frameUrl.startsWith("/");
          if (!isSafeFrame) {
            return (
              <div className={styles.componentTileFrame} style={{ display: "flex", alignItems: "center", justifyContent: "center", background: link.bgColor || "#fff" }}>
                {isTextIcon(link) ? (
                  <span className={styles.tileTextIcon}>{link.src.replace(/^txt:/, "")}</span>
                ) : link.src ? (
                  <img src={link.src} alt="" style={{ maxWidth: "48%", maxHeight: "48%", objectFit: "contain" }} />
                ) : null}
              </div>
            );
          }
          return (
            <iframe
              className={styles.componentTileFrame}
              src={frameUrl}
              title={resolveTileLabel(link)}
              loading="lazy"
              tabIndex={-1}
            />
          );
        })()}
      </button>
      <span className={styles.tileLabel}>{resolveTileLabel(link)}</span>
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
  onContextMenu,
  onLongPress,
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
  onContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onLongPress?: () => void;
  onDragStart?: () => void;
  onDragEnter?: () => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
}) {
  const previewLimit = getFolderPreviewLimit(link.size);
  const slots = children.slice(0, previewLimit);
  const emptySlotCount = Math.max(0, previewLimit - slots.length);
  const tileClassName = [
    styles.tile,
    isDragging ? styles.tileDragging : "",
    isDropTarget ? styles.tileDropTarget : ""
  ]
    .filter(Boolean)
    .join(" ");
  const hold = usePressAndHold({
    enabled: !editMode && Boolean(onLongPress),
    onLongPress: () => {
      onLongPress?.();
    }
  });

  return (
    <div
      data-home-tile="true"
      data-flip-key={link.id}
      className={tileClassName}
      style={getTileStyle(link)}
      draggable={editMode}
      onMouseDown={editMode ? undefined : (event) => hold.start(event.button)}
      onMouseUp={editMode ? undefined : hold.clear}
      onMouseLeave={editMode ? undefined : hold.clear}
      onTouchStart={editMode ? undefined : () => hold.start(0)}
      onTouchEnd={editMode ? undefined : hold.clear}
      onTouchCancel={editMode ? undefined : hold.clear}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onContextMenu?.(event);
      }}
      onDragStart={editMode ? onDragStart : undefined}
      onDragEnter={editMode ? onDragEnter : undefined}
      onDragOver={editMode ? (event) => event.preventDefault() : undefined}
      onDrop={editMode ? onDrop : undefined}
      onDragEnd={editMode ? onDragEnd : undefined}
    >
      <button
        className={`${styles.tileAction} ${getFolderCardClassName(link.size)}`}
        type="button"
        onClick={() => {
          if (hold.consumeClick()) {
            return;
          }
          onOpen();
        }}
        title={link.tips || resolveTileLabel(link)}
      >
        <div className={getFolderGridClassName(link.size)}>
          {slots.map((child) => (
            <div className={styles.folderSlot} key={child.id}>
              {isTextIcon(child) ? (
                <span className={styles.folderSlotText}>{child.src.replace(/^txt:/, "")}</span>
              ) : (
                <img src={child.src} alt="" />
              )}
            </div>
          ))}
          {Array.from({ length: emptySlotCount }).map((_, index) => (
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
  editMode,
  draggingId,
  dropTargetId,
  onClose,
  onContextMenu,
  onEdit,
  onDelete,
  onPin,
  onOpenInlineWindow,
  onDragStart,
  onDragEnter,
  onDrop,
  onDragEnd
}: {
  folder: HomeLink;
  items: HomeLink[];
  openInBlank: boolean;
  editMode: boolean;
  draggingId: string;
  dropTargetId: string;
  onClose: () => void;
  onContextMenu: (linkId: string, event: ReactMouseEvent<HTMLDivElement>) => void;
  onEdit: (link: HomeLink) => void;
  onDelete: (link: HomeLink) => void;
  onPin: (link: HomeLink) => void;
  onOpenInlineWindow: (link: HomeLink) => void;
  onDragStart: (linkId: string) => void;
  onDragEnter: (linkId: string) => void;
  onDrop: (linkId: string) => void;
  onDragEnd: () => void;
}) {
  const gridRef = useFlipLayout(items.map((item) => item.id));

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
        <div className={styles.folderPanelGrid} ref={gridRef}>
          {items.map((item) => (
            <IconTile
              key={item.id}
              link={item}
              openInBlank={openInBlank}
              editMode={editMode}
              isDragging={draggingId === item.id}
              isDropTarget={dropTargetId === item.id && draggingId !== item.id}
              onContextMenu={(event) => onContextMenu(item.id, event)}
              onLongPress={() => {}}
              onEdit={() => onEdit(item)}
              onDelete={() => onDelete(item)}
              onPin={() => onPin(item)}
              onOpenInlineWindow={() => onOpenInlineWindow(item)}
              onDragStart={() => onDragStart(item.id)}
              onDragEnter={() => onDragEnter(item.id)}
              onDrop={() => onDrop(item.id)}
              onDragEnd={onDragEnd}
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
  showTrash,
  draggingTileId,
  draggingFolderTileId,
  draggingDockId,
  dockDropTargetId,
  trashActive,
  onContextMenu,
  onRemove,
  onDragStart,
  onDragEnter,
  onDrop,
  onDragEnd,
  onGridDropToDock,
  onTrashDragEnter,
  onTrashDragLeave,
  onTrashDrop,
  onOpenInlineWindow
}: {
  links: HomeLink[];
  openInBlank: boolean;
  editMode: boolean;
  showTrash: boolean;
  draggingTileId: string;
  draggingFolderTileId: string;
  draggingDockId: string;
  dockDropTargetId: string;
  trashActive: boolean;
  onContextMenu: (linkId: string, event: ReactMouseEvent<HTMLAnchorElement>) => void;
  onRemove: (linkId: string) => void;
  onDragStart: (linkId: string) => void;
  onDragEnter: (linkId: string) => void;
  onDrop: (linkId: string) => void;
  onDragEnd: () => void;
  onGridDropToDock: (sourceId: string, targetId?: string) => void;
  onTrashDragEnter: () => void;
  onTrashDragLeave: () => void;
  onTrashDrop: () => void;
  onOpenInlineWindow: (link: HomeLink) => void;
}) {
  const draggingLinkId = draggingTileId || draggingFolderTileId;
  const listRef = useFlipLayout(links.map((item) => item.id));

  if (links.length === 0 && !editMode) {
    return null;
  }

  return (
    <div className={styles.dock}>
      <div
        ref={listRef}
        className={[
          styles.dockList,
          draggingLinkId ? styles.dockListDropTarget : ""
        ]
          .filter(Boolean)
          .join(" ")}
        onDragOver={
          editMode && draggingLinkId
            ? (event) => {
                event.preventDefault();
              }
            : undefined
        }
        onDrop={
          editMode && draggingLinkId
            ? (event) => {
                const target = event.target;
                if (target instanceof HTMLElement && target.closest("[data-dock-item='true']")) {
                  return;
                }
                event.preventDefault();
                onGridDropToDock(draggingLinkId);
              }
            : undefined
        }
      >
        {links.map((item) => {
          const target = openInBlank && !isInternalLink(item.url) ? "_blank" : "_self";
          const rel = target === "_blank" ? "noreferrer" : undefined;
          const dockItemClassName = [
            styles.dockItem,
            draggingDockId === item.id ? styles.tileDragging : "",
            dockDropTargetId === item.id && draggingDockId !== item.id ? styles.dockItemDropTarget : ""
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <a
              key={item.id}
              data-dock-item="true"
              data-flip-key={item.id}
              className={dockItemClassName}
              href={item.url}
              target={target}
              rel={rel}
              title={resolveTileLabel(item)}
              aria-label={resolveTileLabel(item)}
              draggable={editMode}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onContextMenu(item.id, event);
              }}
              onDragStart={
                editMode
                  ? () => {
                      onTrashDragLeave();
                      onDragStart(item.id);
                    }
                  : undefined
              }
              onDragEnter={
                editMode
                  ? () => {
                      onTrashDragLeave();
                      onDragEnter(item.id);
                    }
                  : undefined
              }
              onDragOver={editMode ? (event) => event.preventDefault() : undefined}
              onDrop={
                editMode
                  ? () => {
                    onTrashDragLeave();
                    if (draggingLinkId) {
                      onGridDropToDock(draggingLinkId, item.id);
                      return;
                    }
                    onDrop(item.id);
                  }
                  : undefined
              }
              onDragEnd={editMode ? onDragEnd : undefined}
              onClick={(event) => {
                if (editMode) {
                  event.preventDefault();
                  return;
                }

                if (isAppLink(item)) {
                  event.preventDefault();
                  onOpenInlineWindow(item);
                }
              }}
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
                {isAppLink(item) ? (
                  <span className={styles.tileAppBadge}>
                    <img className={styles.tileAppBadgeIcon} src="/icons/wapp.svg" alt="" />
                  </span>
                ) : null}
                {isTextIcon(item) ? (
                  <span className={styles.tileIconText}>{item.src.replace(/^txt:/, "")}</span>
                ) : (
                  <img src={item.src} alt={resolveTileLabel(item)} />
                )}
              </span>
            </a>
          );
        })}
      </div>
      {showTrash ? (
        <div className={styles.dockUtility}>
          <div className={styles.dockDivider} />
          <button
            className={[
              styles.dockTrash,
              trashActive && draggingDockId ? styles.dockTrashActive : ""
            ]
              .filter(Boolean)
              .join(" ")}
            type="button"
            aria-label="拖入此处移出 Dock"
            onDragEnter={
              editMode
                ? (event) => {
                    event.preventDefault();
                    onTrashDragEnter();
                  }
                : undefined
            }
            onDragOver={editMode ? (event) => event.preventDefault() : undefined}
            onDragLeave={editMode ? onTrashDragLeave : undefined}
            onDrop={
              editMode
                ? (event) => {
                    event.preventDefault();
                    onTrashDrop();
                  }
                : undefined
            }
          >
            <img src="/icons/trash.svg" alt="" />
          </button>
        </div>
      ) : null}
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

function DesktopContextMenu({
  open,
  x,
  y,
  compactMode,
  onClose,
  onAddLink,
  onAddGroup,
  onOpenBackground,
  onOpenSettings,
  onToggleCompact,
  onRefresh
}: {
  open: boolean;
  x: number;
  y: number;
  compactMode: boolean;
  onClose: () => void;
  onAddLink: () => void;
  onAddGroup: () => void;
  onOpenBackground: () => void;
  onOpenSettings: () => void;
  onToggleCompact: () => void;
  onRefresh: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div
      className={`${styles.contextMenu} ${styles.contextMenuDesktop}`}
      style={{ left: x, top: y }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className={styles.contextMenuSectionLabel}>布局</div>
      <div className={styles.contextMenuLayoutSet}>
        <button
          className={!compactMode ? `${styles.contextMenuLayoutButton} ${styles.contextMenuLayoutButtonActive}` : styles.contextMenuLayoutButton}
          type="button"
          onClick={() => {
            if (compactMode) {
              onToggleCompact();
            }
            onClose();
          }}
        >
          标准
        </button>
        <button
          className={compactMode ? `${styles.contextMenuLayoutButton} ${styles.contextMenuLayoutButtonActive}` : styles.contextMenuLayoutButton}
          type="button"
          onClick={() => {
            if (!compactMode) {
              onToggleCompact();
            }
            onClose();
          }}
        >
          简洁
        </button>
      </div>
      <button
        className={styles.contextMenuItem}
        type="button"
        onClick={() => {
          onAddLink();
          onClose();
        }}
      >
        添加标签
      </button>
      <button
        className={styles.contextMenuItem}
        type="button"
        onClick={() => {
          onAddGroup();
          onClose();
        }}
      >
        添加页面
      </button>
      <button
        className={styles.contextMenuItem}
        type="button"
        onClick={() => {
          onOpenBackground();
          onClose();
        }}
      >
        壁纸
      </button>
      <button
        className={styles.contextMenuItem}
        type="button"
        onClick={() => {
          onOpenSettings();
          onClose();
        }}
      >
        设置中心
      </button>
      <div className={styles.contextMenuDivider} />
      <button
        className={styles.contextMenuItem}
        type="button"
        onClick={() => {
          onRefresh();
          onClose();
        }}
      >
        刷新页面
      </button>
    </div>
  );
}

function TileContextMenu({
  open,
  x,
  y,
  link,
  tabbarEnabled,
  insideFolder,
  pinned,
  pageGroups,
  submenuDirection,
  onClose,
  onOpen,
  onEdit,
  onDelete,
  onMoveOutOfFolder,
  onPin,
  onUnpin,
  onMoveToGroup,
  onResize,
  currentSize,
  resizeOptions
}: {
  open: boolean;
  x: number;
  y: number;
  link: HomeLink | null;
  tabbarEnabled: boolean;
  insideFolder: boolean;
  pinned: boolean;
  pageGroups: HomeLink[];
  submenuDirection: "left" | "right";
  onClose: () => void;
  onOpen?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onMoveOutOfFolder?: () => void;
  onPin?: () => void;
  onUnpin?: () => void;
  onMoveToGroup?: (groupId: string) => void;
  onResize?: (size: string) => void;
  currentSize?: string;
  resizeOptions?: Array<{ label: string; size: string }>;
}) {
  const [groupMenuOpen, setGroupMenuOpen] = useState(false);
  const [resizeMenuOpen, setResizeMenuOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setGroupMenuOpen(false);
      setResizeMenuOpen(false);
    }
  }, [open]);

  if (!open || !link) {
    return null;
  }

  const isFolder = isFolderLink(link);
  const isAction = isActionTile(link);
  const canOpen = isFolder || isAction;
  const canMoveOutOfFolder = insideFolder && Boolean(onMoveOutOfFolder);
  const canMoveToGroup = Boolean(onMoveToGroup);
  const canTogglePin = tabbarEnabled && (Boolean(onPin) || Boolean(onUnpin));
  const canResize = Boolean(onResize) && Array.isArray(resizeOptions) && resizeOptions.length > 0;
  const deleteLabel = isFolder ? "删除文件夹" : "删除标签";
  const editLabel = "编辑标签";

  return (
    <div
      className={`${styles.contextMenu} ${styles.contextMenuTile}`}
      style={{ left: x, top: y }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {canOpen ? (
        <button
          className={styles.contextMenuItem}
          type="button"
          onClick={() => {
            onOpen?.();
            onClose();
          }}
        >
          {isFolder ? "打开文件夹" : "打开入口"}
        </button>
      ) : null}
      {onEdit ? (
        <button
          className={styles.contextMenuItem}
          type="button"
          onClick={() => {
            onEdit();
            onClose();
          }}
        >
          {editLabel}
        </button>
      ) : null}
      {onDelete ? (
        <button
          className={styles.contextMenuItem}
          type="button"
          onClick={() => {
            onDelete();
            onClose();
          }}
        >
          {deleteLabel}
        </button>
      ) : null}
      {canMoveOutOfFolder ? (
        <button
          className={styles.contextMenuItem}
          type="button"
          onClick={() => {
            onMoveOutOfFolder?.();
            onClose();
          }}
        >
          移出文件夹
        </button>
      ) : null}
      {canTogglePin ? (
        <button
          className={styles.contextMenuItem}
          type="button"
          onClick={() => {
            if (pinned) {
              onUnpin?.();
            } else {
              onPin?.();
            }
            onClose();
          }}
        >
          {pinned ? "移出 Dock" : "加入 Dock"}
        </button>
      ) : null}
      {canMoveToGroup ? (
        <div
          className={styles.contextMenuSubmenuWrap}
          onMouseEnter={() => setGroupMenuOpen(true)}
          onMouseLeave={() => setGroupMenuOpen(false)}
        >
          <button className={styles.contextMenuItem} type="button">
            移动至页面
          </button>
          {groupMenuOpen ? (
            <div
              className={`${styles.contextMenuSubmenu} ${
                submenuDirection === "left" ? styles.contextMenuSubmenuLeft : styles.contextMenuSubmenuRight
              }`}
            >
              <button
                className={styles.contextMenuItem}
                type="button"
                onClick={() => {
                  onMoveToGroup?.("");
                  onClose();
                }}
              >
                首页
              </button>
              {pageGroups.map((group) => (
                <button
                  key={group.id}
                  className={styles.contextMenuItem}
                  type="button"
                  onClick={() => {
                    onMoveToGroup?.(group.id);
                    onClose();
                  }}
                >
                  {resolveTileLabel(group)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {canResize ? (
        <div
          className={styles.contextMenuSubmenuWrap}
          onMouseEnter={() => setResizeMenuOpen(true)}
          onMouseLeave={() => setResizeMenuOpen(false)}
        >
          <button className={styles.contextMenuItem} type="button">
            调整规格
          </button>
          {resizeMenuOpen ? (
            <div
              className={`${styles.contextMenuSubmenu} ${
                submenuDirection === "left" ? styles.contextMenuSubmenuLeft : styles.contextMenuSubmenuRight
              }`}
            >
              {resizeOptions!.map((option) => {
                const active = option.size === currentSize;
                return (
                  <button
                    key={option.size}
                    className={styles.contextMenuItem}
                    type="button"
                    onClick={() => {
                      onResize?.(option.size);
                      onClose();
                    }}
                  >
                    {active ? `✓ ${option.label}` : option.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function HomePage({ data }: HomePageProps) {
  const [activeGroupId, setActiveGroupId] = useState("");
  const [currentConfig, setCurrentConfig] = useState<HomeConfig>(data.config);
  const [currentLinks, setCurrentLinks] = useState<HomeLink[]>(data.links);
  const [currentTabbar, setCurrentTabbar] = useState<HomeLink[]>(normalizeTabbarOrder(data.tabbar));
  const [searchHistoryEnabled, setSearchHistoryEnabled] = useState(true);
  const [snapshots, setSnapshots] = useState<HomeSnapshot[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [openFolderId, setOpenFolderId] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileUser, setProfileUser] = useState(data.user);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<HomeLink | null>(null);
  const [backgroundOpen, setBackgroundOpen] = useState(false);
  const [groupManagerOpen, setGroupManagerOpen] = useState(false);
  const [groupManagerInitialId, setGroupManagerInitialId] = useState("");
  const [inlineWindowLink, setInlineWindowLink] = useState<HomeLink | null>(null);
  const [draggingTileId, setDraggingTileId] = useState("");
  const [dropTargetId, setDropTargetId] = useState("");
  const [draggingFolderTileId, setDraggingFolderTileId] = useState("");
  const [folderDropTargetId, setFolderDropTargetId] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const mergeTimerRef = useRef<number | null>(null);
  const [draggingDockId, setDraggingDockId] = useState("");
  const [dockDropTargetId, setDockDropTargetId] = useState("");
  const [gridPreviewIds, setGridPreviewIds] = useState<string[] | null>(null);
  const [folderPreviewIds, setFolderPreviewIds] = useState<string[] | null>(null);
  const [dockPreviewIds, setDockPreviewIds] = useState<string[] | null>(null);
  const [dockTrashActive, setDockTrashActive] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(Boolean(data.notice));
  const [toasts, setToasts] = useState<HomeToastItem[]>([]);
  const [viewportWidth, setViewportWidth] = useState(1440);
  const [desktopMenu, setDesktopMenu] = useState<ContextMenuState>(CLOSED_CONTEXT_MENU);
  const [tileMenu, setTileMenu] = useState<TileContextMenuState>(CLOSED_TILE_CONTEXT_MENU);
  const [snapshotTrackingReady, setSnapshotTrackingReady] = useState(false);
  const snapshotSignatureRef = useRef("");
  const importBackupInputRef = useRef<HTMLInputElement | null>(null);

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

  const closeContextMenus = useCallback(() => {
    setDesktopMenu(CLOSED_CONTEXT_MENU);
    setTileMenu(CLOSED_TILE_CONTEXT_MENU);
  }, []);

  const enterGlobalEditMode = useCallback(() => {
    setEditMode(true);
    setCurrentConfig((config) =>
      config.theme.CompactMode
        ? mergeHomeConfig(config, {
            theme: {
              CompactMode: false
            }
          })
        : config
    );
  }, []);

  useEffect(() => {
    setSnapshotTrackingReady(false);

    if (data.user) {
    }

    const localConfigRaw = window.localStorage.getItem(LOCAL_HOME_CONFIG_STORAGE_KEY);
    if (localConfigRaw) {
      try {
        const parsed = JSON.parse(localConfigRaw) as Partial<HomeConfig>;
        setCurrentConfig(mergeHomeConfig(data.config, parsed));
      } catch {
        // ignore invalid local config
      }
    } else {
      setCurrentConfig(data.config);
    }

    const localLinksRaw = window.localStorage.getItem(LOCAL_HOME_LINK_STORAGE_KEY);
    if (localLinksRaw) {
      try {
        const parsed = JSON.parse(localLinksRaw) as HomeLink[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCurrentLinks(normalizeLinksOrder(parsed));
        }
      } catch {
        // ignore invalid local links
      }
    } else {
      setCurrentLinks(data.links);
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
    } else {
      setCurrentTabbar(normalizeTabbarOrder(data.tabbar));
    }

    const historyFlag = window.localStorage.getItem(SEARCH_HISTORY_ENABLED_STORAGE_KEY);
    setSearchHistoryEnabled(historyFlag === null ? true : historyFlag === "1");

    const snapshotsRaw = window.localStorage.getItem(HOME_SNAPSHOT_STORAGE_KEY);
    if (snapshotsRaw) {
      try {
        const parsed = JSON.parse(snapshotsRaw) as unknown[];
        if (Array.isArray(parsed)) {
          const normalized = parsed
            .map((item) => {
              if (!item || typeof item !== "object") {
                return null;
              }

              const source = item as Record<string, unknown>;
              const id = toStringValue(source.id, "").trim();
              const createdAt = toStringValue(source.createdAt, "").trim();
              if (!id || !createdAt) {
                return null;
              }

              return {
                id,
                createdAt,
                config: mergeHomeConfig(data.config, maybeParseJson(source.config, data.config)),
                links: normalizeLinksOrder(normalizeLinksInput(maybeParseJson(source.links, []))),
                tabbar: normalizeTabbarOrder(normalizeLinksInput(maybeParseJson(source.tabbar, []))),
                activeGroupId: toStringValue(source.activeGroupId, "").trim()
              } satisfies HomeSnapshot;
            })
            .filter((item): item is HomeSnapshot => Boolean(item))
            .slice(0, 20);

          setSnapshots(normalized);
        }
      } catch {
        setSnapshots([]);
      }
    } else {
      setSnapshots([]);
    }

    const timer = window.setTimeout(() => {
      setSnapshotTrackingReady(true);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [data.config, data.links, data.tabbar, data.user]);

  useEffect(() => {
    if (!snapshotTrackingReady) {
      return;
    }

    const signature = JSON.stringify({
      config: currentConfig,
      links: currentLinks,
      tabbar: currentTabbar,
      activeGroupId
    });

    if (!snapshotSignatureRef.current) {
      snapshotSignatureRef.current = signature;
      return;
    }

    if (snapshotSignatureRef.current === signature) {
      return;
    }

    snapshotSignatureRef.current = signature;

    setSnapshots((current) => {
      const nextSnapshot: HomeSnapshot = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        config: currentConfig,
        links: currentLinks,
        tabbar: currentTabbar,
        activeGroupId
      };
      const nextSnapshots = [nextSnapshot, ...current].slice(0, 20);
      window.localStorage.setItem(HOME_SNAPSHOT_STORAGE_KEY, JSON.stringify(nextSnapshots));
      return nextSnapshots;
    });
  }, [activeGroupId, currentConfig, currentLinks, currentTabbar, snapshotTrackingReady]);

  useEffect(() => {
    const homeGroupId = resolveHomeGroupId(currentLinks);
    const storedGroupId = window.localStorage.getItem(PAGE_GROUP_STORAGE_KEY);
    if (!storedGroupId) {
      if (homeGroupId) {
        setActiveGroupId(homeGroupId);
      }
    }

    if (storedGroupId === "") {
      setActiveGroupId(homeGroupId || "");
      return;
    }

    if (currentLinks.some((group) => group.type === "pageGroup" && group.id === storedGroupId)) {
      setActiveGroupId(storedGroupId);
    }
  }, [currentLinks]);

  useEffect(() => {
    window.localStorage.setItem(PAGE_GROUP_STORAGE_KEY, activeGroupId);
  }, [activeGroupId]);

  useEffect(() => {
    if (!editMode) {
      setDraggingTileId("");
      setDropTargetId("");
      setDraggingFolderTileId("");
      setFolderDropTargetId("");
      setDraggingDockId("");
      setDockDropTargetId("");
      setGridPreviewIds(null);
      setFolderPreviewIds(null);
      setDockPreviewIds(null);
      setDockTrashActive(false);
      setOpenFolderId("");
      setMergeTargetId("");
      if (mergeTimerRef.current !== null) {
        window.clearTimeout(mergeTimerRef.current);
        mergeTimerRef.current = null;
      }
    }
  }, [editMode]);

  useEffect(() => {
    function syncViewportWidth() {
      setViewportWidth(window.innerWidth);
    }

    syncViewportWidth();
    window.addEventListener("resize", syncViewportWidth, { passive: true });
    return () => {
      window.removeEventListener("resize", syncViewportWidth);
    };
  }, []);

  useEffect(() => {
    if (!desktopMenu.open && !tileMenu.open) {
      return;
    }

    function handleClose() {
      closeContextMenus();
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeContextMenus();
      }
    }

    window.addEventListener("mousedown", handleClose);
    window.addEventListener("scroll", handleClose, true);
    window.addEventListener("resize", handleClose);
    window.addEventListener("keydown", handleKeydown);

    return () => {
      window.removeEventListener("mousedown", handleClose);
      window.removeEventListener("scroll", handleClose, true);
      window.removeEventListener("resize", handleClose);
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [closeContextMenus, desktopMenu.open, tileMenu.open]);

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

  function handleExportBackup() {
    const payload = {
      exportedAt: new Date().toISOString(),
      config: currentConfig,
      links: currentLinks,
      tabbar: currentTabbar
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8"
    });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `mtab-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
    notify("书签备份已导出。", "success");
  }

  async function handleImportBackup(file: File) {
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as Record<string, unknown>;
      const nextConfig = mergeHomeConfig(data.config, maybeParseJson(payload.config, data.config));
      const nextLinks = normalizeLinksOrder(normalizeLinksInput(maybeParseJson(payload.links ?? payload.link, [])));
      const nextTabbar = normalizeTabbarOrder(normalizeLinksInput(maybeParseJson(payload.tabbar, [])));

      if (nextLinks.length === 0) {
        notify("备份文件中没有可导入的标签数据。", "error");
        return;
      }

      setCurrentConfig(nextConfig);
      setCurrentLinks(nextLinks);
      setCurrentTabbar(nextTabbar);
      setActiveGroupId(resolveHomeGroupId(nextLinks) || "");

      if (data.user) {
        await requestLegacy<unknown>("/config/update", {
          method: "POST",
          data: { config: nextConfig }
        });
        await requestLegacy<unknown>("/link/update", {
          method: "POST",
          data: { link: nextLinks }
        });
        await requestLegacy<unknown>("/tabbar/update", {
          method: "POST",
          data: { tabbar: nextTabbar }
        });
      } else {
        window.localStorage.setItem(LOCAL_HOME_CONFIG_STORAGE_KEY, JSON.stringify(nextConfig));
        window.localStorage.setItem(LOCAL_HOME_LINK_STORAGE_KEY, JSON.stringify(nextLinks));
        window.localStorage.setItem(LOCAL_HOME_TABBAR_STORAGE_KEY, JSON.stringify(nextTabbar));
      }

      notify("书签备份已导入。", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "备份导入失败。", "error");
    }
  }

  async function handleResetHome() {
    if (!window.confirm("确认重置当前首页标签和设置吗？")) {
      return;
    }

    const defaultConfig = mergeHomeConfig(data.config, null);
    const defaultLinks = normalizeLinksOrder(data.links);
    const defaultTabbar = normalizeTabbarOrder(data.tabbar);

    setCurrentConfig(defaultConfig);
    setCurrentLinks(defaultLinks);
    setCurrentTabbar(defaultTabbar);
    setActiveGroupId(resolveHomeGroupId(defaultLinks) || "");
    setOpenFolderId("");
    setGroupManagerOpen(false);
    setLinkEditorOpen(false);
    setEditingLink(null);

    try {
      if (data.user) {
        await requestLegacy<unknown>("/config/update", {
          method: "POST",
          data: { config: defaultConfig }
        });
        await requestLegacy<unknown>("/link/update", {
          method: "POST",
          data: { link: defaultLinks }
        });
        await requestLegacy<unknown>("/tabbar/update", {
          method: "POST",
          data: { tabbar: defaultTabbar }
        });
      } else {
        window.localStorage.setItem(LOCAL_HOME_CONFIG_STORAGE_KEY, JSON.stringify(defaultConfig));
        window.localStorage.setItem(LOCAL_HOME_LINK_STORAGE_KEY, JSON.stringify(defaultLinks));
        window.localStorage.setItem(LOCAL_HOME_TABBAR_STORAGE_KEY, JSON.stringify(defaultTabbar));
      }

      notify("首页标签和设置已重置。", "success");
    } catch (error) {
      notify(error instanceof Error ? error.message : "重置失败。", "error");
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
    tips: string;
    app: number;
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
              pageGroup: payload.pageGroup,
              pid: item.pageGroup !== payload.pageGroup && item.pid ? "" : item.pid,
              tips: payload.tips,
              app: payload.app
            }
          : item
      );
      const nextTabbar = currentTabbar.map((item) =>
        item.id === payload.id
          ? {
              ...item,
              name: payload.name,
              url: payload.url,
              src: payload.src,
              bgColor: payload.bgColor,
              tips: payload.tips,
              app: payload.app
            }
          : item
      );
      await persistLinks(nextLinks);
      if (nextTabbar.some((item) => item.id === payload.id)) {
        await persistTabbar(nextTabbar);
      }
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
      tips: payload.tips,
      app: payload.app,
      sort: getNextRootSort(currentLinks, payload.pageGroup, homeGroupId)
    });

    await persistLinks([...currentLinks, nextLink]);
    notify("标签已添加。", "success");
  }

  async function handleAddCard(payload: {
    id: string | number;
    name: string;
    name_en: string;
    tips: string;
    src: string;
    url: string;
    window: string;
    version: string | number;
    pageGroup: string;
  }) {
    const cardId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nextLink = buildActionLink({
      id: cardId,
      name: payload.name,
      src: payload.src,
      url: payload.url,
      type: "component",
      component: "plugins",
      app: 1,
      size: "2x4",
      sort: getNextRootSort(currentLinks, payload.pageGroup, homeGroupId),
      pageGroup: payload.pageGroup,
      tips: payload.tips,
      originId: payload.id,
      custom: {
        name_en: payload.name_en,
        window: payload.window,
        version: payload.version
      }
    });

    await persistLinks([...currentLinks, nextLink]);
    try {
      if (typeof payload.id === "string") {
        await fetch("/api/cards/install", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: payload.id }),
          credentials: "same-origin"
        });
      } else {
        await requestLegacy<unknown>("/card/install_num", {
          method: "POST",
          data: { id: payload.id }
        });
      }
    } catch {
      // ignore install count failures for local UX
    }
    notify("卡片已添加。", "success");
  }

  async function handleDeleteLink(linkId: string) {
    if (!window.confirm("确认删除这个标签吗？")) {
      return;
    }

    const nextLinks = currentLinks.filter((item) => item.id !== linkId && item.pid !== linkId);
    await persistLinks(nextLinks);
    if (currentTabbar.some((item) => item.id === linkId)) {
      const nextTabbar = currentTabbar.filter((item) => item.id !== linkId);
      await persistTabbar(nextTabbar);
    }
    notify("标签已删除。", "success");
  }

  async function handleResizeLink(linkId: string, size: string) {
    const target = currentLinks.find((item) => item.id === linkId);
    if (!target || target.size === size) {
      return;
    }
    const nextLinks = currentLinks.map((item) => (item.id === linkId ? { ...item, size } : item));
    await persistLinks(nextLinks);
  }

  async function handleDeleteFolder(folderId: string) {
    if (!window.confirm("确认删除这个文件夹吗？文件夹内标签会一并删除。")) {
      return;
    }

    const nextLinks = currentLinks.filter((item) => item.id !== folderId && item.pid !== folderId);
    await persistLinks(nextLinks);
    if (openFolderId === folderId) {
      setOpenFolderId("");
    }
    notify("文件夹已删除。", "success");
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

  async function handleDropTileToDock(sourceId: string, targetId?: string) {
    if (!sourceId) {
      return;
    }

    const sourceLink = currentLinks.find((item) => item.id === sourceId);
    if (!sourceLink || !canEditTile(sourceLink)) {
      return;
    }

    const existingIndex = currentTabbar.findIndex((item) => item.id === sourceId);
    if (existingIndex >= 0) {
      if (targetId && targetId !== sourceId) {
        await handleReorderDock(sourceId, targetId);
      }
      return;
    }

    const nextTabbar = [...currentTabbar];
    const dockItem = {
      ...sourceLink,
      sort: nextTabbar.length
    };
    const targetIndex = targetId ? nextTabbar.findIndex((item) => item.id === targetId) : -1;

    if (targetIndex >= 0) {
      nextTabbar.splice(targetIndex, 0, dockItem);
    } else {
      nextTabbar.push(dockItem);
    }

    await persistTabbar(nextTabbar);
    notify("已加入 Dock。", "success");
  }

  async function handleSaveGroup(payload: { id?: string; name: string; src: string; pageType: HomeLink["pageType"] }) {
    if (payload.id) {
      const nextLinks = currentLinks.map((item) =>
        item.id === payload.id && item.type === "pageGroup"
          ? {
              ...item,
              name: payload.name,
              src: payload.src,
              pageType: payload.pageType
            }
          : item
      );
      await persistLinks(nextLinks);
      notify("页面已更新。", "success");
      return payload.id;
    }

    const groupId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nextGroup = buildActionLink({
      id: groupId,
      name: payload.name,
      src: payload.src,
      url: "",
      type: "pageGroup",
      pageType: payload.pageType,
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
    setActiveGroupId(groupId);
    notify("页面已创建。", "success");
    return groupId;
  }

  async function handleDeleteGroup(groupId: string) {
    if (!window.confirm("确认删除这个页面吗？该页面内标签会回到首页。")) {
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
      setActiveGroupId(resolveHomeGroupId(nextLinks) || "");
    }
    notify("页面已删除。", "success");
  }

  async function handleMoveGroup(groupId: string, direction: "up" | "down") {
    const orderedPages = normalizeLinksOrder(currentLinks.filter((item) => item.type === "pageGroup"));
    const pageIndex = orderedPages.findIndex((item) => item.id === groupId);
    if (pageIndex < 0) {
      return;
    }

    const targetIndex = direction === "up" ? pageIndex - 1 : pageIndex + 1;
    if (targetIndex < 0 || targetIndex >= orderedPages.length) {
      return;
    }

    const nextOrderedPages = [...orderedPages];
    const [source] = nextOrderedPages.splice(pageIndex, 1);
    nextOrderedPages.splice(targetIndex, 0, source);

    const sortMap = new Map(nextOrderedPages.map((item, index) => [item.id, index]));
    const nextLinks = currentLinks.map((item) =>
      item.type === "pageGroup" && sortMap.has(item.id)
        ? {
            ...item,
            sort: sortMap.get(item.id) ?? item.sort
          }
        : item
    );

    await persistLinks(nextLinks);
    notify("页面顺序已更新。", "success");
  }

  async function handleReorderVisibleTiles(sourceId: string, targetId: string) {
    if (!sourceId || !targetId || sourceId === targetId) {
      return;
    }

    const visibleTiles = buildVisibleTiles(currentLinks, activeGroupId, resolveHomeGroupId(currentLinks));
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

  async function handleReorderFolderChildren(folderId: string, sourceId: string, targetId: string) {
    if (!folderId || !sourceId || !targetId || sourceId === targetId) {
      return;
    }

    const orderedIds = buildFolderChildren(currentLinks, folderId).map((item) => item.id);
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
      item.pid === folderId && sortMap.has(item.id)
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

  async function handlePersistVisibleOrder(orderedIds: string[]) {
    const sortMap = new Map(orderedIds.map((id, index) => [id, index] as const));
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

  async function handlePersistFolderOrder(folderId: string, orderedIds: string[]) {
    const sortMap = new Map(orderedIds.map((id, index) => [id, index] as const));
    const nextLinks = currentLinks.map((item) =>
      item.pid === folderId && sortMap.has(item.id)
        ? {
            ...item,
            sort: sortMap.get(item.id) ?? item.sort
          }
        : item
    );

    await persistLinks(nextLinks);
  }

  async function handlePersistDockOrder(orderedIds: string[]) {
    const sortMap = new Map(orderedIds.map((id, index) => [id, index] as const));
    const nextTabbar = currentTabbar.map((item) => ({
      ...item,
      sort: sortMap.get(item.id) ?? item.sort
    }));

    await persistTabbar(nextTabbar);
  }

  function canAutoMergeLinks(source: HomeLink, target: HomeLink): boolean {
    if (source.id === target.id) return false;
    if (!canEditTile(source) || !canEditTile(target)) return false;
    if (isFolderLink(source) || isFolderLink(target)) return false;
    if (source.pageGroup !== target.pageGroup) return false;
    return true;
  }

  function clearMergeTimer() {
    if (mergeTimerRef.current !== null) {
      window.clearTimeout(mergeTimerRef.current);
      mergeTimerRef.current = null;
    }
  }

  function scheduleMergePreview(targetId: string) {
    clearMergeTimer();
    mergeTimerRef.current = window.setTimeout(() => {
      setMergeTargetId(targetId);
      mergeTimerRef.current = null;
    }, 600);
  }

  async function handleAutoCreateFolder(
    sourceId: string,
    targetId: string,
    options: { removeFromDock?: boolean } = {}
  ) {
    if (!sourceId || !targetId || sourceId === targetId) return;

    const source = currentLinks.find((item) => item.id === sourceId);
    const target = currentLinks.find((item) => item.id === targetId);
    if (!source || !target || !canAutoMergeLinks(source, target)) return;

    const folderId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const folder = buildActionLink({
      id: folderId,
      name: "未命名文件夹",
      src: "/static/pageGroup/home.svg",
      url: "",
      type: "component",
      component: "iconGroup",
      size: target.size || "2x2",
      sort: target.sort,
      pageGroup: target.pageGroup
    });

    const nextLinks = currentLinks.map((item) => {
      if (item.id === targetId) {
        return { ...item, pid: folderId, pageGroup: target.pageGroup, sort: 0 };
      }
      if (item.id === sourceId) {
        return { ...item, pid: folderId, pageGroup: target.pageGroup, sort: 1 };
      }
      return item;
    });

    await persistLinks([...nextLinks, folder]);

    if (options.removeFromDock && currentTabbar.some((item) => item.id === sourceId)) {
      await persistTabbar(currentTabbar.filter((item) => item.id !== sourceId));
    }

    notify("已创建文件夹。", "success");
  }

  async function handleMoveLinkIntoFolder(
    sourceId: string,
    folderId: string,
    options: { removeFromDock?: boolean } = {}
  ) {
    if (!sourceId || !folderId || sourceId === folderId) {
      return;
    }

    const sourceLink = currentLinks.find((item) => item.id === sourceId);
    const folderLink = currentLinks.find((item) => item.id === folderId);

    if (!sourceLink || !folderLink || !canEditTile(sourceLink) || !isFolderLink(folderLink)) {
      return;
    }

    if (sourceLink.pid === folderId) {
      return;
    }

    const nextLinks = currentLinks.map((item) =>
      item.id === sourceId
        ? {
            ...item,
            pid: folderId,
            pageGroup: folderLink.pageGroup,
            sort: getNextFolderSort(currentLinks, folderId)
          }
        : item
    );

    await persistLinks(nextLinks);

    if (options.removeFromDock && currentTabbar.some((item) => item.id === sourceId)) {
      await persistTabbar(currentTabbar.filter((item) => item.id !== sourceId));
    }

    notify("标签已移入文件夹。", "success");
  }

  async function handleMoveLinkToRoot(linkId: string) {
    const sourceLink = currentLinks.find((item) => item.id === linkId);
    if (!sourceLink || !sourceLink.pid) {
      return;
    }

    const parentFolder = currentLinks.find((item) => item.id === sourceLink.pid);
    const targetGroupId = sourceLink.pageGroup || parentFolder?.pageGroup || "";
    const nextSort = getNextRootSort(currentLinks, targetGroupId, resolveHomeGroupId(currentLinks));

    const nextLinks = currentLinks.map((item) =>
      item.id === linkId
        ? {
            ...item,
            pid: null,
            pageGroup: targetGroupId,
            sort: nextSort
          }
        : item
    );

    await persistLinks(nextLinks);
    notify("标签已移出文件夹。", "success");
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

  async function handleMoveLinkToGroup(linkId: string, groupId: string) {
    const sourceLink = currentLinks.find((item) => item.id === linkId);
    if (!sourceLink) {
      return;
    }

    const moveChildrenWithFolder = isFolderLink(sourceLink);
    const nextSort = getNextRootSort(currentLinks, groupId, resolveHomeGroupId(currentLinks));
    const nextLinks = currentLinks.map((item) => {
      if (item.id === linkId) {
        return {
          ...item,
          pageGroup: groupId,
          pid: sourceLink.pid ? null : item.pid,
          sort: nextSort
        };
      }

      if (moveChildrenWithFolder && item.pid === linkId) {
        return {
          ...item,
          pageGroup: groupId
        };
      }

      return item;
    });

    await persistLinks(nextLinks);
    notify("标签已移动。", "success");
  }

  function openDesktopContextMenu(x: number, y: number) {
    const position = clampContextMenuPosition(
      x,
      y,
      DESKTOP_CONTEXT_MENU_WIDTH,
      DESKTOP_CONTEXT_MENU_HEIGHT
    );
    setTileMenu(CLOSED_TILE_CONTEXT_MENU);
    setDesktopMenu({
      open: true,
      x: position.x,
      y: position.y
    });
  }

  function openTileContextMenu(linkId: string, x: number, y: number) {
    const position = clampContextMenuPosition(x, y, TILE_CONTEXT_MENU_WIDTH, TILE_CONTEXT_MENU_HEIGHT);
    setDesktopMenu(CLOSED_CONTEXT_MENU);
    setTileMenu({
      open: true,
      x: position.x,
      y: position.y,
      linkId
    });
  }

  function handleMainContextMenu(event: ReactMouseEvent<HTMLElement>) {
    event.preventDefault();

    const target = event.target;
    if (target instanceof HTMLElement && target.closest("[data-home-tile='true']")) {
      return;
    }

    openDesktopContextMenu(event.clientX, event.clientY);
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

  const homeGroupId = resolveHomeGroupId(currentLinks);
  const tiles = buildVisibleTiles(currentLinks, activeGroupId, homeGroupId);
  const folder = openFolderId ? currentLinks.find((item) => item.id === openFolderId) ?? null : null;
  const folderChildren = folder ? buildFolderChildren(currentLinks, folder.id) : [];
  const dockLinks = normalizeTabbarOrder(currentTabbar).slice(0, 9);
  const renderedTiles = buildOrderedItems(tiles, gridPreviewIds);
  const renderedFolderChildren = buildOrderedItems(folderChildren, folderPreviewIds);
  const renderedDockLinks = buildOrderedItems(dockLinks, dockPreviewIds);
  const compactMode = currentConfig.theme.CompactMode;
  const currentPageGroups = normalizeLinksOrder(currentLinks.filter((item) => item.type === "pageGroup"));
  const tileMenuLink = tileMenu.linkId ? currentLinks.find((item) => item.id === tileMenu.linkId) ?? null : null;
  const tileMenuPinned =
    tileMenuLink && canEditTile(tileMenuLink) ? currentTabbar.some((item) => item.id === tileMenuLink.id) : false;
  const tileMenuCanEdit = tileMenuLink ? canEditTile(tileMenuLink) : false;
  const tileMenuIsFolder = tileMenuLink ? isFolderLink(tileMenuLink) : false;
  const tileMenuIsAction = tileMenuLink ? isActionTile(tileMenuLink) : false;
  const tileMenuIsComponent = tileMenuLink ? tileMenuLink.type === "component" && !tileMenuIsFolder : false;
  const tileMenuInsideFolder = Boolean(tileMenuLink?.pid);
  const tileMenuCanMove = Boolean(tileMenuLink) && !tileMenuIsAction;
  const tileMenuCanDelete = tileMenuCanEdit || tileMenuIsFolder || tileMenuIsComponent;
  const tileMenuSubmenuDirection =
    tileMenu.x > viewportWidth - (TILE_CONTEXT_MENU_WIDTH * 2 + 24) ? "left" : "right";
  const gridDraggedLinkId = draggingDockId || draggingTileId;
  const gridDraggedLink = gridDraggedLinkId ? currentLinks.find((item) => item.id === gridDraggedLinkId) ?? null : null;
  const gridColumnCount = getGridColumnCount(
    viewportWidth,
    currentConfig.theme.iconWidth,
    currentConfig.theme.colsGap,
    currentConfig.theme.maxColumn,
    !compactMode && currentConfig.theme.pageGroup
  );
  const gridWidth =
    gridColumnCount * currentConfig.theme.iconWidth +
    Math.max(0, gridColumnCount - 1) * currentConfig.theme.colsGap;
  const gridFlipRef = useFlipLayout(renderedTiles.map((item) => item.id));

  const cssVariables = {
    "--icon-size": `${currentConfig.theme.iconWidth}px`,
    "--icon-radius": `${currentConfig.theme.iconRadius}px`,
    "--name-color": currentConfig.theme.nameColor,
    "--default-icon-background": currentConfig.theme.iconBg ? "#fff" : "transparent",
    "--sidebar-background": currentConfig.theme.sideBackground,
    "--grid-gap": `${currentConfig.theme.colsGap}px`
  } as CSSProperties;
  const themeModeClassName =
    currentConfig.theme.themeMode === "dark"
      ? styles.pageThemeDark
      : currentConfig.theme.themeMode === "light"
        ? styles.pageThemeLight
        : styles.pageThemeAuto;
  const sidebarVisible = !compactMode && currentConfig.theme.pageGroup;
  const sidebarOnRight = sidebarVisible && currentConfig.theme.pageGroupPosition === "right";
  const sidebarOnBottom = sidebarVisible && currentConfig.theme.pageGroupPosition === "bottom";
  const mainClassName = sidebarOnRight
    ? `${styles.main} ${styles.mainSidebarRight}`
    : sidebarOnBottom
      ? `${styles.main} ${styles.mainSidebarBottom}`
      : styles.main;
  const pageClassName = [
    styles.page,
    themeModeClassName,
    currentConfig.theme.LinkTitle ? "" : styles.pageLinkTitleHidden
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={pageClassName} style={cssVariables}>
      <div
        className={styles.background}
        style={{
          backgroundImage: `url("${currentConfig.theme.backgroundImage}")`,
          filter: `blur(${currentConfig.theme.blur}px)`
        }}
      />
      <div className={styles.scrim} style={{ backgroundColor: `rgba(4, 9, 18, ${currentConfig.theme.opacity})` }} />
      <input
        ref={importBackupInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) {
            return;
          }
          void handleImportBackup(file);
          event.currentTarget.value = "";
        }}
      />
      <div className={styles.shell}>
        <HomeToastViewport items={toasts} onDismiss={dismissToast} />
        {sidebarVisible ? (
          <Sidebar
            data={{ ...data, pageGroups: currentPageGroups }}
            pageGroups={currentPageGroups}
            activeGroupId={activeGroupId}
            position={currentConfig.theme.pageGroupPosition}
            autoHide={currentConfig.theme.pageGroupStatus}
            editMode={editMode}
            user={profileUser}
            onOpenAuth={() => setAuthOpen(true)}
            onSelectGroup={setActiveGroupId}
            onOpenGroupManager={() => {
              setGroupManagerInitialId("");
              setGroupManagerOpen(true);
            }}
            onOpenSettings={() => setSettingsOpen(true)}
            onEditGroup={handleEditGroup}
            onDeleteGroup={(groupId) => {
              void handleDeleteGroup(groupId);
            }}
            onNotify={notify}
            onOpenProfile={() => setProfileOpen(true)}
          />
        ) : null}

        <Toolbar
          compactMode={compactMode}
          editMode={editMode}
          sidebarOnRight={sidebarOnRight}
          onToggleCompact={() =>
            setCurrentConfig((config) =>
              mergeHomeConfig(config, {
                theme: {
                  CompactMode: !config.theme.CompactMode
                }
              })
            )
          }
          user={profileUser}
          onOpenAuth={() => setAuthOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleEditMode={() => setEditMode((current) => !current)}
          onNotify={notify}
        />
        <DesktopContextMenu
          open={desktopMenu.open}
          x={desktopMenu.x}
          y={desktopMenu.y}
          compactMode={compactMode}
          onClose={closeContextMenus}
          onAddLink={() => {
            setEditingLink(null);
            setLinkEditorOpen(true);
          }}
          onAddGroup={() => {
            setGroupManagerInitialId("");
            setGroupManagerOpen(true);
          }}
          onOpenBackground={() => setBackgroundOpen(true)}
          onOpenSettings={() => setSettingsOpen(true)}
          onToggleCompact={() =>
            setCurrentConfig((config) =>
              mergeHomeConfig(config, {
                theme: {
                  CompactMode: !config.theme.CompactMode
                }
              })
            )
          }
          onRefresh={() => window.location.reload()}
        />
        <TileContextMenu
          open={tileMenu.open}
          x={tileMenu.x}
          y={tileMenu.y}
          link={tileMenuLink}
          tabbarEnabled={currentConfig.theme.tabbar && tileMenuCanEdit}
          insideFolder={tileMenuInsideFolder}
          pinned={tileMenuPinned}
          pageGroups={currentPageGroups}
          submenuDirection={tileMenuSubmenuDirection}
          onClose={closeContextMenus}
          onOpen={
            tileMenuIsFolder
              ? () => {
                  if (tileMenuLink) {
                    setOpenFolderId(tileMenuLink.id);
                  }
                }
              : tileMenuIsAction
                ? () => {
                    if (tileMenuLink) {
                      handleActionTileClick(tileMenuLink);
                    }
                  }
                : undefined
          }
          onEdit={
            tileMenuCanEdit
              ? () => {
                  if (!tileMenuLink) {
                    return;
                  }
                  setEditingLink(tileMenuLink);
                  setLinkEditorOpen(true);
                }
              : undefined
          }
          onDelete={
            tileMenuIsFolder
              ? () => {
                  if (tileMenuLink) {
                    void handleDeleteFolder(tileMenuLink.id);
                  }
                }
              : tileMenuCanDelete
                ? () => {
                    if (tileMenuLink) {
                      void handleDeleteLink(tileMenuLink.id);
                    }
                  }
                : undefined
          }
          onMoveOutOfFolder={
            tileMenuInsideFolder
              ? () => {
                  if (tileMenuLink) {
                    void handleMoveLinkToRoot(tileMenuLink.id);
                  }
                }
              : undefined
          }
          onPin={
            tileMenuCanEdit
              ? () => {
                  if (tileMenuLink) {
                    void handlePinToDock(tileMenuLink);
                  }
                }
              : undefined
          }
          onUnpin={
            tileMenuCanEdit
              ? () => {
                  if (tileMenuLink) {
                    void handleRemoveDockItem(tileMenuLink.id);
                  }
                }
              : undefined
          }
          onMoveToGroup={
            tileMenuCanMove
              ? (groupId) => {
                  if (tileMenuLink) {
                    void handleMoveLinkToGroup(tileMenuLink.id, groupId);
                  }
                }
              : undefined
          }
          onResize={
            tileMenuIsComponent
              ? (size) => {
                  if (tileMenuLink) {
                    void handleResizeLink(tileMenuLink.id, size);
                  }
                }
              : undefined
          }
          currentSize={tileMenuLink?.size}
          resizeOptions={
            tileMenuIsComponent
              ? [
                  { label: "小 (1×1)", size: "1x1" },
                  { label: "中 (2×2)", size: "2x2" },
                  { label: "大 (2×4)", size: "2x4" }
                ]
              : undefined
          }
        />

        <main className={mainClassName} onContextMenu={handleMainContextMenu}>
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
                searchRecommend={currentConfig.openType.searchRecommend}
                searchLink={currentConfig.openType.searchLink}
                historyEnabled={searchHistoryEnabled}
                quickLinks={tiles.filter((item) => item.type !== "pageGroup" && !item.pid)}
                compactMode={compactMode}
              />
            ) : null}
          </section>

          {!compactMode ? (
            <section
              className={styles.content}
              onDragOver={
                editMode && draggingDockId
                  ? (event) => {
                      event.preventDefault();
                    }
                  : undefined
              }
              onDrop={
                editMode && draggingDockId
                  ? (event) => {
                      const target = event.target;
                      if (target instanceof HTMLElement && target.closest("[data-home-tile='true']")) {
                        return;
                      }
                      event.preventDefault();
                      const sourceDockId = draggingDockId;
                      setDraggingDockId("");
                      setDockDropTargetId("");
                      void handleRemoveDockItem(sourceDockId);
                    }
                  : undefined
              }
            >
              {renderedTiles.length > 0 ? (
                <div
                  ref={gridFlipRef}
                  className={styles.grid}
                  style={{
                    gridTemplateColumns: `repeat(${gridColumnCount}, ${currentConfig.theme.iconWidth}px)`,
                    width: `${gridWidth}px`
                  }}
                >
                  {renderedTiles.map((item) => {
                    const isDragging = draggingTileId === item.id;
                    const isDropTarget = dropTargetId === item.id && draggingTileId !== item.id;
                    const orderedTileIds = renderedTiles.map((entry) => entry.id);
                    const shouldMoveIntoFolder =
                      isFolderLink(item) &&
                      Boolean(gridDraggedLink) &&
                      canEditTile(gridDraggedLink) &&
                      gridDraggedLink.id !== item.id;
                    const shouldAutoMerge =
                      Boolean(gridDraggedLink) &&
                      canAutoMergeLinks(gridDraggedLink, item);
                    const isMergeTarget = mergeTargetId === item.id && shouldAutoMerge;
                    const dragHandlers = editMode
                        ? {
                          onDragStart: () => {
                            setDraggingFolderTileId("");
                            setFolderDropTargetId("");
                            setDraggingDockId("");
                            setDockDropTargetId("");
                            setGridPreviewIds(orderedTileIds);
                            setDraggingTileId(item.id);
                            setMergeTargetId("");
                            clearMergeTimer();
                          },
                          onDragEnter: () => {
                            if (draggingTileId && draggingTileId !== item.id) {
                              setGridPreviewIds((current) =>
                                reorderIdList(current ?? orderedTileIds, draggingTileId, item.id)
                              );
                            }
                            setDropTargetId(item.id);
                            if (shouldAutoMerge) {
                              scheduleMergePreview(item.id);
                            } else {
                              clearMergeTimer();
                              setMergeTargetId("");
                            }
                          },
                          onDragLeave: () => {
                            if (mergeTargetId === item.id) {
                              setMergeTargetId("");
                            }
                            clearMergeTimer();
                          },
                          onDrop: () => {
                            const sourceDockId = draggingDockId;
                            const sourceTileId = draggingTileId;
                            const sourceLinkId = sourceDockId || sourceTileId;
                            const autoMergeFired = mergeTargetId === item.id && shouldAutoMerge;
                            const nextGridOrder =
                              sourceTileId && gridPreviewIds?.length
                                ? gridPreviewIds
                                : reorderIdList(orderedTileIds, sourceTileId, item.id);

                            setDraggingTileId("");
                            setDropTargetId("");
                            setDraggingDockId("");
                            setDockDropTargetId("");
                            setGridPreviewIds(null);
                            setMergeTargetId("");
                            clearMergeTimer();

                            if (shouldMoveIntoFolder && sourceLinkId) {
                              void handleMoveLinkIntoFolder(sourceLinkId, item.id, {
                                removeFromDock: Boolean(sourceDockId)
                              });
                              return;
                            }

                            if (autoMergeFired && sourceLinkId) {
                              void handleAutoCreateFolder(sourceLinkId, item.id, {
                                removeFromDock: Boolean(sourceDockId)
                              });
                              return;
                            }

                            if (sourceDockId) {
                              void handleRemoveDockItem(sourceDockId);
                              return;
                            }

                            if (sourceTileId && nextGridOrder.length > 0) {
                              void handlePersistVisibleOrder(nextGridOrder);
                            }
                          },
                          onDragEnd: () => {
                            setDraggingTileId("");
                            setDropTargetId("");
                            setDraggingDockId("");
                            setDockDropTargetId("");
                            setGridPreviewIds(null);
                            setMergeTargetId("");
                            clearMergeTimer();
                          }
                        }
                      : {
                          onDragStart: undefined,
                          onDragEnter: undefined,
                          onDragLeave: undefined,
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
                          onContextMenu={(event) => openTileContextMenu(item.id, event.clientX, event.clientY)}
                          onLongPress={enterGlobalEditMode}
                          onDragStart={dragHandlers.onDragStart}
                          onDragEnter={dragHandlers.onDragEnter}
                          onDrop={dragHandlers.onDrop}
                          onDragEnd={dragHandlers.onDragEnd}
                        />
                      );
                    }

                    if (isPluginCard(item)) {
                      return (
                        <ComponentTile
                          key={item.id}
                          link={item}
                          editMode={editMode}
                          isDragging={isDragging}
                          isDropTarget={isDropTarget}
                          isMergeTarget={isMergeTarget}
                          onContextMenu={(event) => openTileContextMenu(item.id, event.clientX, event.clientY)}
                          onLongPress={enterGlobalEditMode}
                          onOpenInlineWindow={setInlineWindowLink}
                          onDelete={() => void handleDeleteLink(item.id)}
                          onDragStart={dragHandlers.onDragStart}
                          onDragEnter={dragHandlers.onDragEnter}
                          onDragLeave={dragHandlers.onDragLeave}
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
                          onContextMenu={(event) => openTileContextMenu(item.id, event.clientX, event.clientY)}
                          onClick={() => handleActionTileClick(item)}
                          onLongPress={enterGlobalEditMode}
                          onDragStart={dragHandlers.onDragStart}
                          onDragEnter={dragHandlers.onDragEnter}
                          onDragLeave={dragHandlers.onDragLeave}
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
                        isMergeTarget={isMergeTarget}
                        onContextMenu={(event) => openTileContextMenu(item.id, event.clientX, event.clientY)}
                        onLongPress={enterGlobalEditMode}
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
                        onOpenInlineWindow={() => setInlineWindowLink(item)}
                        onDragStart={dragHandlers.onDragStart}
                        onDragEnter={dragHandlers.onDragEnter}
                        onDragLeave={dragHandlers.onDragLeave}
                        onDrop={dragHandlers.onDrop}
                        onDragEnd={dragHandlers.onDragEnd}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className={styles.emptyState}>当前页面下没有可展示的导航项。</div>
              )}
            </section>
          ) : null}
        </main>

        {!compactMode && currentConfig.theme.tabbar ? (
          <Dock
            links={renderedDockLinks}
            openInBlank={currentConfig.openType.linkOpen}
            editMode={editMode}
            showTrash={currentConfig.theme.trash || Boolean(draggingDockId)}
            draggingTileId={draggingTileId}
            draggingFolderTileId={draggingFolderTileId}
            draggingDockId={draggingDockId}
            dockDropTargetId={dockDropTargetId}
            trashActive={dockTrashActive}
            onContextMenu={(linkId, event) => openTileContextMenu(linkId, event.clientX, event.clientY)}
            onRemove={(linkId) => {
              void handleRemoveDockItem(linkId);
            }}
            onDragStart={(linkId) => {
              setDraggingTileId("");
              setDropTargetId("");
              setDraggingFolderTileId("");
              setFolderDropTargetId("");
              setDockTrashActive(false);
              setDockPreviewIds(renderedDockLinks.map((item) => item.id));
              setDraggingDockId(linkId);
            }}
            onDragEnter={(linkId) => {
              setDockTrashActive(false);
              if (draggingDockId && draggingDockId !== linkId) {
                setDockPreviewIds((current) =>
                  reorderIdList(current ?? renderedDockLinks.map((item) => item.id), draggingDockId, linkId)
                );
              }
              setDockDropTargetId(linkId);
            }}
            onDrop={(linkId) => {
              const sourceId = draggingDockId;
              const nextDockOrder =
                sourceId && dockPreviewIds?.length
                  ? dockPreviewIds
                  : reorderIdList(renderedDockLinks.map((item) => item.id), sourceId, linkId);
              setDraggingDockId("");
              setDockDropTargetId("");
              setDockPreviewIds(null);
              setDockTrashActive(false);
              if (sourceId && nextDockOrder.length > 0) {
                void handlePersistDockOrder(nextDockOrder);
              }
            }}
            onDragEnd={() => {
              setDraggingDockId("");
              setDockDropTargetId("");
              setDockPreviewIds(null);
              setDockTrashActive(false);
            }}
            onGridDropToDock={(sourceId, targetId) => {
              setDraggingTileId("");
              setDropTargetId("");
              setDraggingFolderTileId("");
              setFolderDropTargetId("");
              setDockPreviewIds(null);
              void handleDropTileToDock(sourceId, targetId);
            }}
            onTrashDragEnter={() => setDockTrashActive(true)}
            onTrashDragLeave={() => setDockTrashActive(false)}
            onTrashDrop={() => {
              const sourceId = draggingDockId;
              setDraggingDockId("");
              setDockDropTargetId("");
              setDockTrashActive(false);
              if (sourceId) {
                void handleRemoveDockItem(sourceId);
              }
            }}
            onOpenInlineWindow={setInlineWindowLink}
          />
        ) : null}
        <RecordBar site={data.site} />

        {folder ? (
          <FolderModal
            folder={folder}
            items={renderedFolderChildren}
            openInBlank={currentConfig.openType.linkOpen}
            editMode={editMode}
            draggingId={draggingFolderTileId}
            dropTargetId={folderDropTargetId}
            onClose={() => {
              setOpenFolderId("");
              setDraggingFolderTileId("");
              setFolderDropTargetId("");
              setFolderPreviewIds(null);
            }}
            onContextMenu={(linkId, event) => openTileContextMenu(linkId, event.clientX, event.clientY)}
            onEdit={(link) => {
              setEditingLink(link);
              setLinkEditorOpen(true);
            }}
            onDelete={(link) => {
              void handleDeleteLink(link.id);
            }}
            onPin={(link) => {
              void handlePinToDock(link);
            }}
            onOpenInlineWindow={setInlineWindowLink}
            onDragStart={(linkId) => {
              setDraggingTileId("");
              setDropTargetId("");
              setDraggingDockId("");
              setDockDropTargetId("");
              setFolderPreviewIds(renderedFolderChildren.map((item) => item.id));
              setDraggingFolderTileId(linkId);
            }}
            onDragEnter={(linkId) => {
              if (draggingFolderTileId && draggingFolderTileId !== linkId) {
                setFolderPreviewIds((current) =>
                  reorderIdList(
                    current ?? renderedFolderChildren.map((item) => item.id),
                    draggingFolderTileId,
                    linkId
                  )
                );
              }
              setFolderDropTargetId(linkId);
            }}
            onDrop={(linkId) => {
              const sourceId = draggingFolderTileId;
              const nextFolderOrder =
                sourceId && folderPreviewIds?.length
                  ? folderPreviewIds
                  : reorderIdList(renderedFolderChildren.map((item) => item.id), sourceId, linkId);
              setDraggingFolderTileId("");
              setFolderDropTargetId("");
              setFolderPreviewIds(null);
              if (sourceId && nextFolderOrder.length > 0) {
                void handlePersistFolderOrder(folder.id, nextFolderOrder);
              }
            }}
            onDragEnd={() => {
              setDraggingFolderTileId("");
              setFolderDropTargetId("");
              setFolderPreviewIds(null);
            }}
          />
        ) : null}
        {inlineWindowLink ? (
          <InlineAppWindow
            link={inlineWindowLink}
            onClose={() => setInlineWindowLink(null)}
          />
        ) : null}
        <AuthDialog
          open={authOpen}
          site={data.site}
          onClose={() => setAuthOpen(false)}
          onNotify={notify}
        />
        {profileUser ? (
          <HomeProfileDialog
            open={profileOpen}
            user={profileUser}
            onClose={() => setProfileOpen(false)}
            onSaved={(next) => {
              setProfileUser((prev) =>
                prev
                  ? {
                      ...prev,
                      name: next.name,
                      avatarUrl: next.avatarUrl,
                      nickname: next.name ?? prev.nickname,
                      avatar: next.avatarUrl?.trim() || prev.avatar
                    }
                  : prev
              );
            }}
            onNotify={notify}
          />
        ) : null}
        <HomeSettingsDialog
          open={settingsOpen}
          config={currentConfig}
          site={data.site}
          saving={settingsSaving}
          loggedIn={Boolean(data.user)}
          user={profileUser}
          pageCount={Math.max(1, currentPageGroups.length + 1)}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSaveSettings}
          onOpenAuth={() => {
            setSettingsOpen(false);
            setAuthOpen(true);
          }}
          onOpenProfile={() => {
            setSettingsOpen(false);
            setProfileOpen(true);
          }}
          onOpenBackground={() => {
            setSettingsOpen(false);
            setBackgroundOpen(true);
          }}
          onImportBackup={() => {
            importBackupInputRef.current?.click();
          }}
          onOpenPageManager={() => {
            setSettingsOpen(false);
            setGroupManagerInitialId("");
            setGroupManagerOpen(true);
          }}
          onExportBackup={handleExportBackup}
          onResetHome={() => {
            setSettingsOpen(false);
            void handleResetHome();
          }}
          searchHistoryEnabled={searchHistoryEnabled}
          onSearchHistoryChange={(enabled) => {
            setSearchHistoryEnabled(enabled);
            window.localStorage.setItem(SEARCH_HISTORY_ENABLED_STORAGE_KEY, enabled ? "1" : "0");
            if (!enabled) {
              window.localStorage.removeItem(SEARCH_HISTORY_STORAGE_KEY);
            }
          }}
          snapshots={snapshots}
          onRestoreSnapshot={async (snapshotId) => {
            const snapshot = snapshots.find((item) => item.id === snapshotId);
            if (!snapshot) {
              return;
            }

            setCurrentConfig(snapshot.config);
            setCurrentLinks(snapshot.links);
            setCurrentTabbar(snapshot.tabbar);
            setActiveGroupId(snapshot.activeGroupId);
            setSettingsOpen(false);

            try {
              if (data.user) {
                await requestLegacy<unknown>("/config/update", {
                  method: "POST",
                  data: { config: snapshot.config }
                });
                await requestLegacy<unknown>("/link/update", {
                  method: "POST",
                  data: { link: snapshot.links }
                });
                await requestLegacy<unknown>("/tabbar/update", {
                  method: "POST",
                  data: { tabbar: snapshot.tabbar }
                });
              } else {
                window.localStorage.setItem(LOCAL_HOME_CONFIG_STORAGE_KEY, JSON.stringify(snapshot.config));
                window.localStorage.setItem(LOCAL_HOME_LINK_STORAGE_KEY, JSON.stringify(snapshot.links));
                window.localStorage.setItem(LOCAL_HOME_TABBAR_STORAGE_KEY, JSON.stringify(snapshot.tabbar));
              }

              notify("已恢复到选中的历史快照。", "success");
            } catch (error) {
              notify(error instanceof Error ? error.message : "恢复失败。", "error");
            }
          }}
          onConfigChange={setCurrentConfig}
        />
        <AddLinkDialog
          open={linkEditorOpen}
          mode={editingLink ? "edit" : "create"}
          activeGroupId={activeGroupId}
          pageGroups={currentPageGroups}
          site={data.site}
          initialLink={editingLink}
          onClose={() => {
            setLinkEditorOpen(false);
            setEditingLink(null);
          }}
          onSave={handleSaveLink}
          onAddCard={handleAddCard}
        />
        <BackgroundDialog
          open={backgroundOpen}
          currentBackground={currentConfig.theme.backgroundImage}
          onClose={() => setBackgroundOpen(false)}
          onApply={handleApplyBackground}
        />
        <PageManagerDialog
          open={groupManagerOpen}
          pages={currentPageGroups}
          activePageId={activeGroupId}
          homePageId={homeGroupId}
          initialPageId={groupManagerInitialId}
          onClose={() => {
            setGroupManagerOpen(false);
            setGroupManagerInitialId("");
          }}
          onSave={handleSaveGroup}
          onDelete={handleDeleteGroup}
          onSelectPage={(pageId) => {
            setActiveGroupId(pageId);
          }}
          onMovePage={(pageId, direction) => handleMoveGroup(pageId, direction)}
        />
      </div>
    </div>
  );
}
