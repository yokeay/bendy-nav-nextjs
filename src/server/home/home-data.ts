import path from "node:path";
import { readFile } from "node:fs/promises";
import { cache } from "react";
import sql from "@/lib/db";
import { TtlCache } from "@/lib/cache";
import type {
  HomeAuthCookies,
  HomeConfig,
  HomeData,
  HomeLink,
  HomeNotice,
  HomeOpenType,
  HomeSearchEngine,
  HomeSiteInfo,
  HomeTheme,
  HomeUser
} from "./types";

const APP_VERSION = "2.4.11";
const ROOT_DIR = process.cwd();
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DEFAULT_BRAND_ICON = "/brand/logo-192.png";
const DEFAULT_GUEST_AVATAR = DEFAULT_BRAND_ICON;

const settingsCache = new TtlCache<Record<string, string>>();
const appLinkCache = new TtlCache<Map<number, LinkStoreRow>>();

type LinkStoreRow = {
  id: number;
  custom: unknown;
  url: string | null;
  src: string | null;
  name: string | null;
  bgColor: string | null;
};

type DefaultHomeState = {
  link: unknown[];
  tabbar: unknown[];
  config: Record<string, unknown>;
};

const SEARCH_ENGINES: HomeSearchEngine[] = [
  {
    key: "bing",
    name: "Bing",
    icon: "/static/searchEngine/bing.svg",
    action: "https://www.bing.com/search",
    queryParam: "q"
  },
  {
    key: "baidu",
    name: "百度",
    icon: "/static/searchEngine/baidu.svg",
    action: "https://www.baidu.com/s",
    queryParam: "wd"
  },
  {
    key: "google",
    name: "Google",
    icon: "/static/searchEngine/google.svg",
    action: "https://www.google.com/search",
    queryParam: "q"
  },
  {
    key: "duckduckgo",
    name: "DuckDuckGo",
    icon: "/static/searchEngine/DuckDuckGo.svg",
    action: "https://duckduckgo.com/",
    queryParam: "q"
  }
];

function sanitizeRelativePublicPath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\.\./g, "");
}

function toPublicAbsPath(relativePath: string): string {
  return path.join(PUBLIC_DIR, sanitizeRelativePublicPath(relativePath));
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

function toNumberValue(input: unknown, fallback = 0): number {
  const value = Number(input);
  return Number.isFinite(value) ? value : fallback;
}

function toBooleanValue(input: unknown, fallback = false): boolean {
  if (typeof input === "boolean") {
    return input;
  }

  if (typeof input === "number") {
    return input !== 0;
  }

  if (typeof input === "string") {
    const normalized = input.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "off", ""].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}

function normalizeAssetPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  return trimmed;
}

function normalizeLinkUrl(value: string): string {
  const normalized = normalizeAssetPath(value);
  if (!normalized) {
    return "";
  }

  if (
    normalized.startsWith("/") ||
    normalized.startsWith("tab://") ||
    /^[a-z]+:/i.test(normalized)
  ) {
    return normalized;
  }

  return `https://${normalized}`;
}

function resolveBrandAssetPath(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  const normalized = trimmed.toLowerCase();
  if (
    normalized === "/static/mtab.png" ||
    normalized === "/favicon.ico" ||
    normalized === "/favicon.png" ||
    normalized === "/favicon"
  ) {
    return fallback;
  }

  return normalizeAssetPath(trimmed);
}

function settingValue(
  settings: Record<string, string>,
  key: string,
  defaultValue = "",
  emptyReplace = false
): string {
  const value = settings[key];
  if (value === undefined) {
    return defaultValue;
  }

  if (emptyReplace && value.length === 0) {
    return defaultValue;
  }

  return value;
}

function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeLink(input: unknown): HomeLink | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const source = input as Record<string, unknown>;
  const id = toStringValue(source.id, "").trim();

  if (!id) {
    return null;
  }

  const type = toStringValue(source.type, "icon") as HomeLink["type"];

  return {
    id,
    app: toNumberValue(source.app, 0),
    pid: toStringValue(source.pid, "").trim() || null,
    src: normalizeAssetPath(toStringValue(source.src, "").trim()),
    url: normalizeLinkUrl(toStringValue(source.url, "").trim()),
    name: toStringValue(source.name, "").trim(),
    size: toStringValue(source.size, "1x1").trim() || "1x1",
    sort: toNumberValue(source.sort, 0),
    type,
    bgColor: toStringValue(source.bgColor, "").trim() || null,
    pageGroup: toStringValue(source.pageGroup, "").trim(),
    form: toStringValue(source.form, "").trim(),
    component: toStringValue(source.component, "").trim() || null,
    tips: toStringValue(source.tips, "").trim(),
    custom:
      source.custom && typeof source.custom === "object" && !Array.isArray(source.custom)
        ? (source.custom as Record<string, unknown>)
        : null,
    originId: toNumberValue(source.origin_id ?? source.originId, 0) || null
  };
}

function normalizeLinks(input: unknown): HomeLink[] {
  const list = Array.isArray(input) ? input : [];
  return list.map(normalizeLink).filter((item): item is HomeLink => item !== null);
}

async function loadSettingsMap(): Promise<Record<string, string>> {
  const cached = settingsCache.get("settings:all");
  if (cached !== null) {
    return cached;
  }

  try {
    const rows = await sql<{ keys: string; value: string | null }[]>`
      SELECT keys, value
      FROM setting
    `;

    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.keys] = row.value ?? "";
    }

    settingsCache.set("settings:all", result, 300);
    return result;
  } catch {
    return {};
  }
}

const loadDefaultHomeState = cache(async (configuredPath: string): Promise<DefaultHomeState> => {
  const candidates = Array.from(
    new Set(
      [configuredPath, "static/defaultTab.json"]
        .map((value) => sanitizeRelativePublicPath(value))
        .filter(Boolean)
    )
  );

  for (const relativePath of candidates) {
    try {
      const text = await readFile(toPublicAbsPath(relativePath), "utf8");
      const payload = JSON.parse(text) as Record<string, unknown>;
      return {
        link: Array.isArray(payload.link) ? payload.link : [],
        tabbar: Array.isArray(payload.tabbar) ? payload.tabbar : [],
        config: maybeParseJson<Record<string, unknown>>(payload.config, {})
      };
    } catch {
      // ignore and continue
    }
  }

  return {
    link: [],
    tabbar: [],
    config: {}
  };
});

async function loadAppLinkMap(): Promise<Map<number, LinkStoreRow>> {
  const cached = appLinkCache.get("linkstore:apps");
  if (cached !== null) {
    return cached;
  }

  try {
    const rows = await sql<LinkStoreRow[]>`
      SELECT id, custom, url, src, name, "bgColor"
      FROM linkstore
      WHERE app = 1
    `;

    const result = new Map<number, LinkStoreRow>();
    for (const row of rows) {
      result.set(row.id, row);
    }

    appLinkCache.set("linkstore:apps", result, 3600);
    return result;
  } catch {
    return new Map<number, LinkStoreRow>();
  }
}

async function decorateLinks(links: HomeLink[]): Promise<HomeLink[]> {
  if (links.length === 0) {
    return links;
  }

  const appMap = await loadAppLinkMap();

  return links.map((item) => {
    if (item.app !== 1 || item.type !== "icon" || !item.originId) {
      return item;
    }

    const mapped = appMap.get(item.originId);
    if (!mapped) {
      return item;
    }

    return {
      ...item,
      custom:
        mapped.custom && typeof mapped.custom === "object" && !Array.isArray(mapped.custom)
          ? (mapped.custom as Record<string, unknown>)
          : item.custom,
      url: normalizeLinkUrl(mapped.url ?? item.url),
      src: normalizeAssetPath(mapped.src ?? item.src),
      name: toStringValue(mapped.name, item.name).trim() || item.name,
      bgColor: toStringValue(mapped.bgColor, item.bgColor ?? "").trim() || item.bgColor
    };
  });
}

async function resolveCurrentUser(auth: HomeAuthCookies): Promise<HomeUser | null> {
  const userId = toNumberValue(auth.userId, 0);
  const token = toStringValue(auth.token, "").trim();

  if (!userId || !token) {
    return null;
  }

  try {
    const tokenRows = await sql<{ user_id: number; create_time: number }[]>`
      SELECT user_id, create_time
      FROM token
      WHERE user_id = ${userId}
        AND token = ${token}
      LIMIT 1
    `;

    if (tokenRows.length === 0) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (now > tokenRows[0].create_time + 60 * 60 * 24 * 15) {
      return null;
    }

    const userRows = await sql<
      {
        id: number;
        status: number;
        group_id: number;
        manager: number;
        mail: string | null;
        nickname: string | null;
        avatar: string | null;
      }[]
    >`
      SELECT id, status, group_id, COALESCE(manager, 0) AS manager, mail, nickname, avatar
      FROM "user"
      WHERE id = ${userId}
      LIMIT 1
    `;

    const currentUser = userRows[0];
    if (!currentUser || currentUser.status !== 0) {
      return null;
    }

    return {
      userId: currentUser.id,
      groupId: toNumberValue(currentUser.group_id, 0),
      manager: toNumberValue(currentUser.manager, 0) === 1,
      email: toStringValue(currentUser.mail, "").trim(),
      nickname: toStringValue(currentUser.nickname, "").trim(),
      avatar: resolveBrandAssetPath(
        toStringValue(currentUser.avatar, "").trim(),
        DEFAULT_GUEST_AVATAR
      )
    };
  } catch {
    return null;
  }
}

async function loadUserHomeState(userId: number): Promise<{
  link: HomeLink[];
  tabbar: HomeLink[];
  config: Record<string, unknown>;
} | null> {
  try {
    const [linkRows, tabRows, configRows] = await Promise.all([
      sql<{ link: unknown }[]>`
        SELECT link
        FROM link
        WHERE user_id = ${userId}
        LIMIT 1
      `,
      sql<{ tabs: unknown }[]>`
        SELECT tabs
        FROM tabbar
        WHERE user_id = ${userId}
        LIMIT 1
      `,
      sql<{ config: unknown }[]>`
        SELECT config
        FROM config
        WHERE user_id = ${userId}
        LIMIT 1
      `
    ]);

    return {
      link: normalizeLinks(linkRows[0]?.link ?? []),
      tabbar: normalizeLinks(tabRows[0]?.tabs ?? []),
      config: maybeParseJson<Record<string, unknown>>(configRows[0]?.config ?? {}, {})
    };
  } catch {
    return null;
  }
}

function normalizeOpenType(input: Record<string, unknown>): HomeOpenType {
  return {
    searchStatus: toBooleanValue(input.searchStatus, true),
    searchOpen: toBooleanValue(input.searchOpen, true),
    linkOpen: toBooleanValue(input.linkOpen, true),
    autofocus: toBooleanValue(input.autofocus, true),
    searchLink: toBooleanValue(input.searchLink, true),
    searchRecommend: toBooleanValue(input.searchRecommend, true),
    tabbar: toBooleanValue(input.tabbar, true)
  };
}

function normalizeTheme(input: Record<string, unknown>): HomeTheme {
  return {
    backgroundImage: normalizeAssetPath(
      toStringValue(input.backgroundImage, "/static/background.jpeg")
    ),
    backgroundMime: toNumberValue(input.backgroundMime, 0),
    blur: toNumberValue(input.blur, 0),
    timeColor: toStringValue(input.timeColor, "#fff"),
    tabbar: toBooleanValue(input.tabbar, true),
    tabbarMode: toBooleanValue(input.tabbarMode, false),
    iconWidth: Math.max(48, toNumberValue(input.iconWidth, 60)),
    iconBg: toBooleanValue(input.iconBg, false),
    LinkTitle: toBooleanValue(input.LinkTitle, false),
    iconRadius: Math.max(6, toNumberValue(input.iconRadius, 10)),
    CompactMode: toBooleanValue(input.CompactMode, false),
    nameColor: toStringValue(input.nameColor, "#fff"),
    opacity: Math.min(1, Math.max(0, Number(input.opacity ?? 0.1))),
    colsGap: Math.max(8, toNumberValue(input.colsGap, 35)),
    pageGroup: toBooleanValue(input.pageGroup, true),
    pageGroupStatus: toBooleanValue(input.pageGroupStatus, false),
    timeView: toBooleanValue(input.timeView, true),
    timeWeek: toBooleanValue(input.timeWeek, true),
    timeGanZhi: toBooleanValue(input.timeGanZhi, true),
    timeSecond: toBooleanValue(input.timeSecond, true),
    timeMonthDay: toBooleanValue(input.timeMonthDay, true),
    timeLunar: toBooleanValue(input.timeLunar, true),
    time24: toBooleanValue(input.time24, true),
    maxColumn: Math.max(3, toNumberValue(input.maxColumn, 14)),
    latestPageGroup: toBooleanValue(input.latestPageGroup, false),
    bottom2top: toBooleanValue(input.bottom2top, true),
    userCenterPosition: toStringValue(input.userCenterPosition, "left"),
    trash: toBooleanValue(input.trash, true),
    pageGroupPosition:
      toStringValue(input.pageGroupPosition, "left") === "right" ? "right" : "left"
  };
}

function buildConfig(
  defaults: Record<string, unknown>,
  overrides: Record<string, unknown>
): HomeConfig {
  const defaultOpenType = maybeParseJson<Record<string, unknown>>(defaults.openType, {});
  const overrideOpenType = maybeParseJson<Record<string, unknown>>(overrides.openType, {});
  const defaultTheme = maybeParseJson<Record<string, unknown>>(defaults.theme, {});
  const overrideTheme = maybeParseJson<Record<string, unknown>>(overrides.theme, {});

  return {
    openType: normalizeOpenType({ ...defaultOpenType, ...overrideOpenType }),
    theme: normalizeTheme({ ...defaultTheme, ...overrideTheme })
  };
}

function buildSiteInfo(settings: Record<string, string>): HomeSiteInfo {
  const logo = resolveBrandAssetPath(
    settingValue(settings, "logo", DEFAULT_BRAND_ICON, true),
    DEFAULT_BRAND_ICON
  );
  const favicon = resolveBrandAssetPath(
    settingValue(settings, "favicon", logo, true),
    logo || DEFAULT_BRAND_ICON
  );

  return {
    title: settingValue(settings, "title", "笨迪导航", true),
    description: settingValue(
      settings,
      "description",
      "笨迪导航 - 可自部署的导航与新标签页",
      true
    ),
    keywords: settingValue(settings, "keywords", "笨迪导航,新标签页,导航页", true),
    logo: logo || DEFAULT_GUEST_AVATAR,
    favicon: favicon || DEFAULT_BRAND_ICON,
    recordNumber: settingValue(settings, "recordNumber", "", true),
    beianMps: settingValue(settings, "beianMps", "", true),
    copyright: settingValue(settings, "copyright", "", false),
    mobileRecordNumber: settingValue(settings, "mobileRecordNumber", "0", true),
    allowRegister: settingValue(settings, "user_register", "0", true) === "0",
    authCheckMode:
      settingValue(settings, "auth_check", "0", true) === "1"
        ? "old_password"
        : "email_code",
    qqLoginEnabled: settingValue(settings, "qq_login", "0") === "1",
    wxLoginEnabled: settingValue(settings, "wx_login", "0") === "1"
  };
}

function buildNotice(settings: Record<string, string>): HomeNotice | null {
  const raw = settingValue(settings, "globalNotify", "");
  if (!raw) {
    return null;
  }

  const parsed = maybeParseJson<Record<string, unknown>>(raw, {});
  if (toNumberValue(parsed.status, 0) !== 1) {
    return null;
  }

  const title = toStringValue(parsed.title, "").trim();
  const message = stripHtmlTags(toStringValue(parsed.html, "")).trim();
  if (!title && !message) {
    return null;
  }

  return {
    title: title || "站点通知",
    message
  };
}

function sortLinks(links: HomeLink[]): HomeLink[] {
  return [...links].sort((left, right) => {
    if (left.sort === right.sort) {
      return left.id.localeCompare(right.id);
    }

    return left.sort - right.sort;
  });
}

export async function getHomePageData(auth: HomeAuthCookies): Promise<HomeData> {
  const settingsPromise = loadSettingsMap();
  const userPromise = resolveCurrentUser(auth);

  const settings = await settingsPromise;
  const defaultHomeStatePromise = loadDefaultHomeState(
    settingValue(settings, "defaultTab", "static/defaultTab.json", true)
  );

  const [user, defaultHomeState] = await Promise.all([userPromise, defaultHomeStatePromise]);

  let links = normalizeLinks(defaultHomeState.link);
  let tabbar = normalizeLinks(defaultHomeState.tabbar);
  let config = maybeParseJson<Record<string, unknown>>(defaultHomeState.config, {});

  if (user) {
    const userHomeState = await loadUserHomeState(user.userId);
    if (userHomeState) {
      if (userHomeState.link.length > 0) {
        links = userHomeState.link;
      }

      if (userHomeState.tabbar.length > 0) {
        tabbar = userHomeState.tabbar;
      }

      if (Object.keys(userHomeState.config).length > 0) {
        config = userHomeState.config;
      }
    }
  }

  const [decoratedLinks, decoratedTabbar] = await Promise.all([
    decorateLinks(links),
    decorateLinks(tabbar)
  ]);

  const normalizedLinks = sortLinks(decoratedLinks);
  const normalizedTabbar = sortLinks(decoratedTabbar);

  return {
    legacyUrl: "/manager",
    site: buildSiteInfo(settings),
    config: buildConfig(defaultHomeState.config, config),
    links: normalizedLinks,
    tabbar: normalizedTabbar,
    pageGroups: normalizedLinks.filter((item) => item.type === "pageGroup"),
    searchEngines: SEARCH_ENGINES,
    user,
    notice: buildNotice(settings)
  };
}

export async function getHomeMetadata() {
  const data = await getHomePageData({});

  return {
    title: data.site.title,
    description: data.site.description,
    keywords: data.site.keywords,
    favicon: data.site.favicon,
    logo: data.site.logo,
    version: APP_VERSION
  };
}
