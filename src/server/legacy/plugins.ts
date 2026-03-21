import path from "node:path";
import { access, readFile, readdir } from "node:fs/promises";

import mime from "mime-types";
import { NextResponse } from "next/server";

type AnyObject = Record<string, unknown>;

type CacheLike = {
  get(key: string): unknown | null;
  set(key: string, value: unknown, ttlSeconds: number): void;
};

export type PluginContext = {
  pathSegments: string[];
  requestData: {
    query: AnyObject;
  };
};

export type PluginDeps = {
  rootDir: string;
  memoryCache: CacheLike;
  buildFileResponse: (
    body: Uint8Array | string,
    contentType: string,
    cacheSeconds?: number
  ) => NextResponse;
  renderNotFound: () => Promise<NextResponse> | NextResponse;
  sanitizePluginName: (name: string) => string;
  sanitizeRelativePublicPath: (pathValue: string) => string;
  toStringValue: (value: unknown, defaultValue?: string) => string;
  deepGet: <T>(source: AnyObject | undefined, keyPath: string, defaultValue: T) => T;
  jsonSuccess: (msg: unknown, data?: unknown) => NextResponse;
  jsonError: (msg: unknown) => NextResponse;
  handleAppsTopSearchController: (ctx: any, action: string) => Promise<NextResponse>;
};

type PluginInfo = {
  name?: string;
  name_en?: string;
  tips?: string;
  src?: string;
  url?: string;
  window?: string;
  version?: number | string;
  status?: number | string;
  install_num?: number | string;
};

const WEATHER_PLUGIN_TTL = 300;
const WEATHER_PLUGIN_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const PLUGIN_DIR_ALIAS: Record<string, string> = {
  topsearch: "topSearch"
};

function resolvePluginDirName(name: string): string {
  return PLUGIN_DIR_ALIAS[name.toLowerCase()] ?? name;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function extractWeatherJson(raw: string): string {
  let text = raw.trim();
  text = text.replace(/^\s*var\s+\w+\s*=\s*/i, "");
  text = text.trim().replace(/;$/, "");
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");
  let start = objectStart;
  let endChar = "}";
  if (arrayStart !== -1 && (arrayStart < objectStart || objectStart === -1)) {
    start = arrayStart;
    endChar = "]";
  }
  if (start === -1) {
    return "";
  }
  const end = text.lastIndexOf(endChar);
  if (end === -1) {
    return "";
  }
  return text.slice(start, end + 1);
}

async function fetchWeatherCn(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        Referer: "http://www.weather.com.cn/",
        "User-Agent": WEATHER_PLUGIN_UA
      }
    });
    if (!response.ok) {
      return "";
    }
    return await response.text();
  } catch {
    return "";
  }
}

async function getWeatherPluginNow(
  cache: CacheLike,
  cityId: string
): Promise<AnyObject> {
  const cacheKey = `pluginWeatherNow:${cityId}`;
  const cached = cache.get(cacheKey);
  if (cached !== null) {
    return cached as AnyObject;
  }

  const raw = await fetchWeatherCn(`http://d1.weather.com.cn/sk_2d/${cityId}.html`);
  const jsonText = extractWeatherJson(raw);
  if (!jsonText) {
    return {};
  }
  try {
    const data = JSON.parse(jsonText) as AnyObject;
    const result = {
      cityId,
      city: String(data.cityname ?? ""),
      temp: String(data.temp ?? ""),
      weather: String(data.weather ?? ""),
      wind: `${String(data.WD ?? "")} ${String(data.WS ?? "")}`.trim(),
      humidity: String(data.SD ?? ""),
      time: String(data.time ?? "")
    };
    cache.set(cacheKey, result, WEATHER_PLUGIN_TTL);
    return result;
  } catch {
    return {};
  }
}

async function getWeatherPluginForecast(
  cache: CacheLike,
  cityId: string
): Promise<AnyObject> {
  const cacheKey = `pluginWeatherForecast:${cityId}`;
  const cached = cache.get(cacheKey);
  if (cached !== null) {
    return cached as AnyObject;
  }

  const raw = await fetchWeatherCn(
    `http://www.weather.com.cn/data/cityinfo/${cityId}.html`
  );
  const jsonText = extractWeatherJson(raw);
  if (!jsonText) {
    return {};
  }
  try {
    const json = JSON.parse(jsonText) as AnyObject;
    const info = (json.weatherinfo ?? {}) as AnyObject;
    const result = {
      cityId,
      city: String(info.city ?? ""),
      temp1: String(info.temp1 ?? ""),
      temp2: String(info.temp2 ?? ""),
      weather: String(info.weather ?? ""),
      ptime: String(info.ptime ?? "")
    };
    cache.set(cacheKey, result, WEATHER_PLUGIN_TTL);
    return result;
  } catch {
    return {};
  }
}

async function getWeatherPluginSearch(
  cache: CacheLike,
  city: string
): Promise<AnyObject[]> {
  const cacheKey = `pluginWeatherSearch:${city}`;
  const cached = cache.get(cacheKey);
  if (cached !== null) {
    return cached as AnyObject[];
  }

  const raw = await fetchWeatherCn(
    `http://toy1.weather.com.cn/search?cityname=${encodeURIComponent(city)}`
  );
  const jsonText = extractWeatherJson(raw);
  if (!jsonText) {
    return [];
  }
  try {
    const data = JSON.parse(jsonText) as AnyObject[];
    if (!Array.isArray(data)) {
      return [];
    }
    const result: AnyObject[] = [];
    for (const item of data) {
      const ref = String(item.ref ?? "");
      const parts = ref ? ref.split("~") : [];
      const id = String(parts[0] ?? item.id ?? "");
      const name = String(parts[1] ?? parts[2] ?? item.name ?? "");
      if (id && name) {
        result.push({ id, name });
      }
    }
    cache.set(cacheKey, result, WEATHER_PLUGIN_TTL);
    return result;
  } catch {
    return [];
  }
}

function normalizeTemp(value: unknown): string {
  const text = String(value ?? "");
  const match = text.match(/-?\d+/);
  if (match) {
    return match[0];
  }
  return text.replace(/[^\d-]/g, "");
}

function mapWeatherIcon(text: string): string {
  const normalized = text.trim();
  if (!normalized) {
    return "yun";
  }
  if (normalized.includes("雨夹雪")) return "yujiaxue";
  if (normalized.includes("雷")) return "lei";
  if (normalized.includes("雪")) return "xue";
  if (normalized.includes("雾") || normalized.includes("霾")) return "wu";
  if (normalized.includes("沙")) return "shachen";
  if (normalized.includes("阵雨")) return "zhenyu";
  if (normalized.includes("雨")) return "yu";
  if (normalized.includes("阴")) return "yin";
  if (normalized.includes("晴")) return "qing";
  if (normalized.includes("云")) return "yun";
  return "yun";
}

function buildWeatherV2List(now: AnyObject, forecast: AnyObject): AnyObject[] {
  const text = String(now.weather ?? forecast.weather ?? "");
  const tem = normalizeTemp(now.temp ?? "");
  const tem1 = normalizeTemp(forecast.temp1 ?? "");
  const tem2 = normalizeTemp(forecast.temp2 ?? "");
  const icon = mapWeatherIcon(text);
  const base = new Date();
  const list: AnyObject[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = new Date(base);
    date.setDate(base.getDate() + i);
    list.push({
      date: date.toISOString().slice(0, 10),
      tem: tem || tem1 || tem2,
      tem1: tem1 || tem,
      tem2: tem2 || tem,
      text,
      wea_img: icon
    });
  }
  return list;
}

export async function getWeatherV2CityFallback(): Promise<AnyObject> {
  return {
    cityZh: "北京",
    provinceZh: "北京",
    countryZh: "中国",
    leaderZh: "北京",
    id: "101010100"
  };
}

export async function getWeatherV2Now(
  cache: CacheLike,
  cityId: string
): Promise<AnyObject> {
  const now = await getWeatherPluginNow(cache, cityId);
  const forecast = await getWeatherPluginForecast(cache, cityId);
  const list = buildWeatherV2List(now, forecast);
  return { data: list };
}

export async function getWeatherV2Search(
  cache: CacheLike,
  city: string
): Promise<AnyObject[]> {
  const list = await getWeatherPluginSearch(cache, city);
  return list.map((item) => ({
    id: String(item.id ?? ""),
    cityZh: String(item.name ?? ""),
    provinceZh: "",
    countryZh: "中国",
    leaderZh: String(item.name ?? ""),
    name: String(item.name ?? "")
  }));
}

async function renderPluginView(
  rootDir: string,
  pluginName: string,
  view: "card" | "window",
  buildFileResponse: PluginDeps["buildFileResponse"],
  renderNotFound: PluginDeps["renderNotFound"]
): Promise<NextResponse> {
  const pluginDir = resolvePluginDirName(pluginName);
  const viewPath = path.join(rootDir, "plugins", pluginDir, "view", `${view}.html`);
  if (await fileExists(viewPath)) {
    const html = await readFile(viewPath, "utf8");
    return buildFileResponse(html, "text/html; charset=utf-8", 60);
  }
  return renderNotFound();
}

async function handleTopSearchPluginApi(
  ctx: PluginContext,
  action: string,
  deps: PluginDeps
): Promise<NextResponse> {
  if (action !== "list") {
    return deps.jsonError("not action");
  }
  const type = deps
    .toStringValue(deps.deepGet(ctx.requestData.query, "type", "baidu"))
    .trim()
    .toLowerCase();
  const normalized = type === "baidu" ? "baidutopsearch" : type;
  return deps.handleAppsTopSearchController(ctx, normalized);
}

async function handleWeatherPluginApi(
  ctx: PluginContext,
  action: string,
  deps: PluginDeps
): Promise<NextResponse> {
  switch (action) {
    case "now": {
      const cityId = deps.toStringValue(
        deps.deepGet(ctx.requestData.query, "cityId", "101010100")
      );
      const data = await getWeatherPluginNow(deps.memoryCache, cityId);
      if (Object.keys(data).length > 0) {
        return deps.jsonSuccess("ok", data);
      }
      return deps.jsonError("fail");
    }
    case "forecast": {
      const cityId = deps.toStringValue(
        deps.deepGet(ctx.requestData.query, "cityId", "101010100")
      );
      const data = await getWeatherPluginForecast(deps.memoryCache, cityId);
      if (Object.keys(data).length > 0) {
        return deps.jsonSuccess("ok", data);
      }
      return deps.jsonError("fail");
    }
    case "search": {
      const city = deps
        .toStringValue(deps.deepGet(ctx.requestData.query, "city", ""))
        .trim();
      if (!city) {
        return deps.jsonSuccess("ok", []);
      }
      const result = await getWeatherPluginSearch(deps.memoryCache, city);
      return deps.jsonSuccess("ok", result);
    }
    default:
      return deps.jsonError("not action");
  }
}

async function handlePluginApi(
  ctx: PluginContext,
  pluginName: string,
  segments: string[],
  deps: PluginDeps
): Promise<NextResponse> {
  const action = deps.toStringValue(segments[0] ?? "", "").toLowerCase();
  switch (pluginName.toLowerCase()) {
    case "topsearch":
      return handleTopSearchPluginApi(ctx, action, deps);
    case "weather":
      return handleWeatherPluginApi(ctx, action, deps);
    default:
      return deps.jsonError("not action");
  }
}

async function readLocalPluginInfos(rootDir: string): Promise<PluginInfo[]> {
  const pluginsDir = path.join(rootDir, "plugins");
  let entries: Array<{ name: string; isDirectory: () => boolean }> = [];
  try {
    entries = await readdir(pluginsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const infos: PluginInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const infoPath = path.join(pluginsDir, entry.name, "info.json");
    if (!(await fileExists(infoPath))) {
      continue;
    }
    try {
      const content = await readFile(infoPath, "utf8");
      const parsed = JSON.parse(content) as PluginInfo;
      infos.push(parsed ?? {});
    } catch {
      // ignore
    }
  }
  return infos;
}

export async function mergeLocalPluginCards(
  rootDir: string,
  rows: AnyObject[]
): Promise<AnyObject[]> {
  const existing = new Set(
    rows.map((row) => String(row.name_en ?? "").toLowerCase()).filter(Boolean)
  );
  const locals = await readLocalPluginInfos(rootDir);
  for (const info of locals) {
    const nameEn = String(info.name_en ?? "").trim();
    if (!nameEn) {
      continue;
    }
    const key = nameEn.toLowerCase();
    if (existing.has(key)) {
      continue;
    }
    existing.add(key);
    rows.push({
      id: 0,
      name: info.name ?? "",
      name_en: nameEn,
      status: Number(info.status ?? 1) || 1,
      version: Number(info.version ?? 0) || 0,
      tips: info.tips ?? "",
      src: info.src ?? "",
      url: info.url ?? "",
      window: info.window ?? "",
      install_num: Number(info.install_num ?? 0) || 0
    });
  }
  return rows;
}

export function createPluginsHandler(deps: PluginDeps) {
  return async function handlePluginsPath(
    ctx: PluginContext
  ): Promise<NextResponse> {
    const rootDir = deps.rootDir;
    const segments = ctx.pathSegments;

    if (segments.length < 2) {
      return deps.renderNotFound();
    }

    const pluginName = deps.sanitizePluginName(segments[1]);
    if (!pluginName) {
      return deps.renderNotFound();
    }
    const pluginDir = resolvePluginDirName(pluginName);

    const action = (segments[2] ?? "").toLowerCase();

    if (action === "static" && segments.length >= 4) {
      const fileRelative = deps.sanitizeRelativePublicPath(segments.slice(3).join("/"));
      const pluginFile = path.join(rootDir, "plugins", pluginDir, "static", fileRelative);

      if (await fileExists(pluginFile)) {
        const buffer = await readFile(pluginFile);
        const type = mime.lookup(pluginFile) || "application/octet-stream";
        return deps.buildFileResponse(buffer, String(type), 60 * 60 * 24 * 7);
      }

      const fallback = path.join(
        rootDir,
        "public",
        "static",
        "app",
        pluginDir,
        fileRelative
      );
      if (await fileExists(fallback)) {
        const buffer = await readFile(fallback);
        const type = mime.lookup(fallback) || "application/octet-stream";
        return deps.buildFileResponse(buffer, String(type), 60 * 60 * 24 * 7);
      }

      return deps.renderNotFound();
    }

    if (action === "card" || action === "window") {
      return renderPluginView(
        rootDir,
        pluginName,
        action,
        deps.buildFileResponse,
        deps.renderNotFound
      );
    }

    if (action === "api") {
      return handlePluginApi(ctx, pluginName, segments.slice(3), deps);
    }

    return deps.renderNotFound();
  };
}
