"use client";

import Link from "next/link";
import type { CSSProperties, FormEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import type { HomeConfig, HomeData, HomeLink, HomeSearchEngine, HomeTheme } from "@/server/home/types";
import { AuthDialog, UserMenu } from "./home-auth";
import { requestLegacy } from "./home-client";
import { HomeSettingsDialog } from "./home-settings";
import { HomeToastViewport, type HomeToastItem, type HomeToastTone } from "./home-toast";
import styles from "./home-page.module.css";

const LOCAL_HOME_CONFIG_STORAGE_KEY = "config";
const SEARCH_ENGINE_STORAGE_KEY = "SearchEngineLocal";
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

function buildFolderChildren(data: HomeData, folderId: string) {
  return data.links.filter(
    (item) => item.pid === folderId && item.type === "icon" && !isSpecialLegacyLink(item)
  );
}

function buildDockLinks(data: HomeData) {
  return data.tabbar.filter((item) => item.type === "icon" && !isSpecialLegacyLink(item)).slice(0, 9);
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
  activeGroupId,
  onSelectGroup
}: {
  data: HomeData;
  activeGroupId: string;
  onSelectGroup: (groupId: string) => void;
}) {
  const sidebarLinks = buildSidebarLinks(data);

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

            return (
              <button
                key={item.id || "home"}
                className={className}
                type="button"
                onClick={() => onSelectGroup(item.id)}
                title={item.label}
                aria-label={item.label}
              >
                <img className={styles.sidebarIcon} src={item.icon} alt="" />
                <span className={styles.sidebarText}>{item.label}</span>
              </button>
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
      </div>
      <div className={styles.sidebarGroup} />
    </aside>
  );
}

function Toolbar({
  compactMode,
  onToggleCompact,
  legacyUrl,
  user,
  onOpenAuth,
  onOpenSettings,
  onNotify
}: {
  compactMode: boolean;
  onToggleCompact: () => void;
  legacyUrl: string;
  user: HomeData["user"];
  onOpenAuth: () => void;
  onOpenSettings: () => void;
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

function IconTile({
  link,
  openInBlank
}: {
  link: HomeLink;
  openInBlank: boolean;
}) {
  const label = resolveTileLabel(link);
  const target = openInBlank && !isInternalLink(link.url) ? "_blank" : "_self";
  const rel = target === "_blank" ? "noreferrer" : undefined;

  return (
    <div className={styles.tile} style={getTileStyle(link)}>
      <a
        className={styles.tileAction}
        href={link.url}
        title={link.tips || label}
        target={target}
        rel={rel}
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

function FolderTile({
  link,
  children,
  onOpen
}: {
  link: HomeLink;
  children: HomeLink[];
  onOpen: () => void;
}) {
  const slots = children.slice(0, 4);

  return (
    <div className={styles.tile} style={getTileStyle(link)}>
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
            <IconTile key={item.id} link={item} openInBlank={openInBlank} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Dock({ links, openInBlank }: { links: HomeLink[]; openInBlank: boolean }) {
  if (links.length === 0) {
    return null;
  }

  return (
    <div className={styles.dock}>
      {links.map((item) => {
        const target = openInBlank && !isInternalLink(item.url) ? "_blank" : "_self";
        const rel = target === "_blank" ? "noreferrer" : undefined;

        return (
          <a
            key={item.id}
            className={styles.dockItem}
            href={item.url}
            target={target}
            rel={rel}
            title={resolveTileLabel(item)}
          >
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
  const [openFolderId, setOpenFolderId] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
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
    }

    const storedGroupId = window.localStorage.getItem(PAGE_GROUP_STORAGE_KEY);
    if (!storedGroupId) {
      return;
    }

    if (storedGroupId === "" || data.pageGroups.some((group) => group.id === storedGroupId)) {
      setActiveGroupId(storedGroupId);
    }
  }, [data.pageGroups, data.user]);

  useEffect(() => {
    window.localStorage.setItem(PAGE_GROUP_STORAGE_KEY, activeGroupId);
  }, [activeGroupId]);

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

  const tiles = buildRootTiles(data, activeGroupId);
  const folder = openFolderId ? data.links.find((item) => item.id === openFolderId) ?? null : null;
  const folderChildren = folder ? buildFolderChildren(data, folder.id) : [];
  const dockLinks = buildDockLinks(data);
  const compactMode = currentConfig.theme.CompactMode;

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
          <Sidebar data={data} activeGroupId={activeGroupId} onSelectGroup={setActiveGroupId} />
        ) : null}

        <Toolbar
          compactMode={compactMode}
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
                    if (item.type === "component" && item.component === "iconGroup") {
                      return (
                        <FolderTile
                          key={item.id}
                          link={item}
                          children={buildFolderChildren(data, item.id)}
                          onOpen={() => setOpenFolderId(item.id)}
                        />
                      );
                    }

                    return (
                      <IconTile
                        key={item.id}
                        link={item}
                        openInBlank={currentConfig.openType.linkOpen}
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
          <Dock links={dockLinks} openInBlank={currentConfig.openType.linkOpen} />
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
      </div>
    </div>
  );
}
