import { createHash, randomUUID } from "node:crypto";

import {

  access,

  copyFile,

  mkdir,

  readdir,

  readFile,

  rename,

  rm,

  stat,

  unlink,

  writeFile

} from "node:fs/promises";

import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import AdmZip from "adm-zip";

import { load as loadHtml } from "cheerio";

import mime from "mime-types";

import nodemailer from "nodemailer";

import qs from "qs";

import sharp from "sharp";

import { getSmtpConfig } from "@/lib/app-config";

import sql from "@/lib/db";

import { TtlCache } from "@/lib/cache";



const APP_VERSION = "2.4.3";

const APP_VERSION_CODE = 243;

const ROOT_DIR = process.cwd();

const PUBLIC_DIR = path.join(ROOT_DIR, "public");

const RUNTIME_DIR = path.join(ROOT_DIR, "runtime");

const BROWSER_EXT_TEMPLATE_DIR = path.join(ROOT_DIR, "resources", "browserExt");
const DEFAULT_BRAND_ICON = "/brand/logo-192.png";
const DEFAULT_GUEST_AVATAR = DEFAULT_BRAND_ICON;



const settingsCache = new TtlCache<Record<string, string>>();

const memoryCache = new TtlCache<unknown>();

const templateCache = new TtlCache<string>();



type AnyObject = Record<string, unknown>;



type RequestData = {

  query: AnyObject;

  body: AnyObject;

  all: AnyObject;

  formData: FormData | null;

  files: Map<string, File>;

};



type AuthUser = {

  user_id: number;

  token: string;

  create_time: number;

  group_id: number;

};



type LegacyContext = {

  request: NextRequest;

  pathSegments: string[];

  path: string;

  requestData: RequestData;

  settings: Record<string, string>;

  auth: boolean;

  cachedUser: AuthUser | null | undefined;

};



class JsonError extends Error {

  public readonly payload: Record<string, unknown>;

  public readonly status: number;



  constructor(payload: Record<string, unknown>, status = 200) {

    super(typeof payload.msg === "string" ? payload.msg : "Legacy JSON Error");

    this.payload = payload;

    this.status = status;

  }

}



function withCors(response: NextResponse): NextResponse {

  response.headers.set("Access-Control-Allow-Origin", "*");

  response.headers.set("Access-Control-Allow-Methods", "*");

  response.headers.set("Access-Control-Allow-Headers", "*");

  return response;

}



function successPayload(msg: unknown, data: unknown = []): Record<string, unknown> {

  if (Array.isArray(msg) || (typeof msg === "object" && msg !== null)) {

    return { msg: "", code: 1, data: msg };

  }

  return {

    msg: typeof msg === "string" ? msg : "ok",

    code: 1,

    data

  };

}



function errorPayload(msg: unknown, data: unknown = []): Record<string, unknown> {

  if (Array.isArray(msg) || (typeof msg === "object" && msg !== null)) {

    return { msg: "", code: 0, data: msg };

  }

  return {

    msg: typeof msg === "string" ? msg : "error",

    code: 0,

    data

  };

}



function jsonSuccess(msg: unknown, data: unknown = []): NextResponse {

  return NextResponse.json(successPayload(msg, data));

}



function jsonError(msg: unknown, data: unknown = []): NextResponse {

  return NextResponse.json(errorPayload(msg, data));

}



function throwJsonError(msg: unknown, data: unknown = [], status = 200): never {

  throw new JsonError(errorPayload(msg, data), status);

}



function normalizePath(input: string): string {

  return input.replace(/\\/g, "/").replace(/\/{2,}/g, "/");

}



function joinPath(path1: string, path2 = ""): string {

  return normalizePath(`${path1}/${path2}`);

}



function randomToken(seed = "tab"): string {

  const source = `${randomUUID()}${Date.now()}${seed}`;

  return md5(source);

}



function md5(source: string | Buffer): string {

  return createHash("md5").update(source).digest("hex");

}



function nowUnix(): number {

  return Math.floor(Date.now() / 1000);

}



function nowDateTimeString(): string {

  return new Date().toISOString().slice(0, 19).replace("T", " ");

}



function todayDateString(): string {

  return new Date().toISOString().slice(0, 10);

}



function parseBooleanEnv(value: string | undefined): boolean {

  if (!value) {

    return false;

  }

  const normalized = value.trim().toLowerCase();

  return normalized === "1" || normalized === "true" || normalized === "yes";

}



function isDemoMode(): boolean {

  return parseBooleanEnv(process.env.DEMO_MODE ?? process.env.demo_mode);

}



function validateEmail(email: string): boolean {

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

}



function deepGet<T = unknown>(

  source: AnyObject | undefined,

  keyPath: string,

  defaultValue: T

): T {

  if (!source) {

    return defaultValue;

  }

  const segments = keyPath.split(".");

  let current: unknown = source;

  for (const segment of segments) {

    if (

      typeof current !== "object" ||

      current === null ||

      !(segment in (current as AnyObject))

    ) {

      return defaultValue;

    }

    current = (current as AnyObject)[segment];

  }

  return (current as T) ?? defaultValue;

}



function deepSet(target: AnyObject, keyPath: string, value: unknown): void {

  const segments = keyPath.split(".");

  let cursor: AnyObject = target;

  for (let i = 0; i < segments.length - 1; i += 1) {

    const segment = segments[i];

    const existing = cursor[segment];

    if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {

      cursor[segment] = {};

    }

    cursor = cursor[segment] as AnyObject;

  }



  const finalKey = segments[segments.length - 1];

  const existingFinal = cursor[finalKey];

  if (existingFinal === undefined) {

    cursor[finalKey] = value;

    return;

  }

  if (Array.isArray(existingFinal)) {

    existingFinal.push(value);

    return;

  }

  cursor[finalKey] = [existingFinal, value];

}



function deepMerge(target: AnyObject, source: AnyObject): AnyObject {

  for (const [key, value] of Object.entries(source)) {

    if (

      value &&

      typeof value === "object" &&

      !Array.isArray(value) &&

      target[key] &&

      typeof target[key] === "object" &&

      !Array.isArray(target[key])

    ) {

      deepMerge(target[key] as AnyObject, value as AnyObject);

    } else {

      target[key] = value;

    }

  }

  return target;

}



function toArray<T>(value: unknown): T[] {

  if (Array.isArray(value)) {

    return value as T[];

  }

  if (value === undefined || value === null || value === "") {

    return [];

  }

  return [value as T];

}



function parseNumber(value: unknown, defaultValue = 0): number {

  const numeric = Number(value);

  if (Number.isNaN(numeric) || !Number.isFinite(numeric)) {

    return defaultValue;

  }

  return numeric;

}



function toStringValue(value: unknown, defaultValue = ""): string {

  if (value === undefined || value === null) {

    return defaultValue;

  }

  return String(value);

}



function containsCsvValue(csv: string | null | undefined, target: string | number): boolean {

  if (!csv) {

    return false;

  }

  const lookup = String(target).trim();

  return csv

    .split(",")

    .map((item) => item.trim())

    .filter(Boolean)

    .includes(lookup);

}



function csvToNumberArray(csv: string | null | undefined): number[] {

  if (!csv) {

    return [];

  }

  return csv

    .split(",")

    .map((item) => Number(item.trim()))

    .filter((item) => Number.isFinite(item));

}



function numberArrayToCsv(value: unknown): string {

  const arr = toArray<number | string>(value);

  if (arr.length === 0) {

    return "0";

  }

  return arr

    .map((item) => parseNumber(item, 0))

    .filter((item) => Number.isFinite(item))

    .join(",");

}



function rootUrl(request: NextRequest): string {

  return request.nextUrl.origin;

}



function getRealIp(request: NextRequest): string {

  const xff = request.headers.get("x-forwarded-for");

  if (xff) {

    const [first] = xff.split(",");

    if (first?.trim()) {

      return first.trim();

    }

  }

  const xr = request.headers.get("x-real-ip");

  if (xr?.trim()) {

    return xr.trim();

  }

  return "127.0.0.1";

}



async function fileExists(filePath: string): Promise<boolean> {

  try {

    await access(filePath);

    return true;

  } catch {

    return false;

  }

}



function sanitizeRelativePublicPath(relativePath: string): string {

  const cleaned = normalizePath(relativePath).replace(/^\/+/, "");

  return cleaned.replace(/\.\./g, "");

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

  return trimmed;
}



function toPublicAbsPath(relativePath: string): string {

  return path.join(PUBLIC_DIR, sanitizeRelativePublicPath(relativePath));

}



async function loadTextFileCached(filePath: string): Promise<string> {

  const cacheKey = `template:${filePath}`;

  const cached = templateCache.get(cacheKey);

  if (cached !== null) {

    return cached;

  }

  const content = await readFile(filePath, "utf8");

  templateCache.set(cacheKey, content, 60);

  return content;

}



function buildFileResponse(

  body: Uint8Array | string,

  contentType: string,

  cacheSeconds = 0

): NextResponse {

  const response = new NextResponse(body as unknown as BodyInit, { status: 200 });

  response.headers.set("Content-Type", contentType);

  if (cacheSeconds > 0) {

    response.headers.set("Cache-Control", `public, max-age=${cacheSeconds}`);

  }

  return response;

}



async function servePublicFile(relativePath: string, cacheSeconds = 0): Promise<NextResponse> {

  const absPath = toPublicAbsPath(relativePath);

  if (!(await fileExists(absPath))) {

    return new NextResponse("", { status: 404 });

  }

  const buffer = await readFile(absPath);

  const type = mime.lookup(absPath) || "application/octet-stream";

  return buildFileResponse(buffer, String(type), cacheSeconds);

}



async function parseRequestData(request: NextRequest): Promise<RequestData> {

  const queryRaw = qs.parse(request.nextUrl.searchParams.toString(), {

    depth: 8

  }) as AnyObject;

  const query = queryRaw ?? {};

  const body: AnyObject = {};

  const files = new Map<string, File>();

  let formData: FormData | null = null;



  if (!["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) {

    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

    if (contentType.includes("application/json")) {

      try {

        const jsonBody = (await request.json()) as AnyObject;

        if (jsonBody && typeof jsonBody === "object") {

          deepMerge(body, jsonBody);

        }

      } catch {

        // ignore invalid json

      }

    } else if (contentType.includes("application/x-www-form-urlencoded")) {

      const text = await request.text();

      const parsed = qs.parse(text, { depth: 8 }) as AnyObject;

      deepMerge(body, parsed);

    } else if (contentType.includes("multipart/form-data")) {

      formData = await request.formData();

      for (const [key, value] of formData.entries()) {

        if (value instanceof File) {

          files.set(key, value);

          deepSet(body, key, value);

        } else {

          deepSet(body, key, value);

        }

      }

    } else {

      const text = await request.text();

      if (text.trim().length > 0) {

        const parsed = qs.parse(text, { depth: 8 }) as AnyObject;

        deepMerge(body, parsed);

      }

    }

  }



  const all = deepMerge(structuredClone(query), body);

  return { query, body, all, formData, files };

}



async function getSettingsMap(forceRefresh = false): Promise<Record<string, string>> {

  const cacheKey = "settings:all";

  if (!forceRefresh) {

    const cached = settingsCache.get(cacheKey);

    if (cached !== null) {

      return cached;

    }

  }

  const rows = await sql<{ keys: string; value: string | null }[]>`

    SELECT keys, value FROM setting

  `;

  const result: Record<string, string> = {};

  for (const row of rows) {

    result[row.keys] = row.value ?? "";

  }

  mergeSmtpConfigIntoSettings(result);

  settingsCache.set(cacheKey, result, 300);

  return result;

}



async function refreshSettingsMap(): Promise<Record<string, string>> {

  settingsCache.delete("settings:all");

  return getSettingsMap(true);

}

function mergeSmtpConfigIntoSettings(settings: Record<string, string>): void {
  const smtp = getSmtpConfig();
  const mapped: Record<string, string> = {
    smtp_email: String(smtp.email ?? "").trim(),
    smtp_host: String(smtp.host ?? "").trim(),
    smtp_port: smtp.port ? String(smtp.port) : "",
    smtp_password: String(smtp.password ?? ""),
    smtp_ssl: Number.isFinite(smtp.ssl) ? String(smtp.ssl) : "",
    smtp_code_template: String(smtp.codeTemplate ?? "")
  };

  for (const [key, value] of Object.entries(mapped)) {
    if (!value) {
      continue;
    }
    const current = settings[key];
    if (current === undefined || current.length === 0) {
      settings[key] = value;
    }
  }
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



async function createContext(request: NextRequest, pathSegments: string[]): Promise<LegacyContext> {

  const requestData = await parseRequestData(request);

  const settings = await getSettingsMap();

  const authCode = settingValue(settings, "authCode", process.env.AUTH_CODE ?? "", true);

  return {

    request,

    pathSegments,

    path: `/${pathSegments.join("/")}`.replace(/\/+$/, ""),

    requestData,

    settings,

    auth: Boolean(authCode),

    cachedUser: undefined

  };

}



function assertNotDemoMode(): void {

  if (isDemoMode()) {

    throwJsonError("演示模式，部分功能受限，禁止更新或删除！");

  }

}



async function getUser(ctx: LegacyContext, must = false): Promise<AuthUser | null> {

  if (ctx.cachedUser !== undefined) {

    if (must && ctx.cachedUser === null) {

      throwJsonError("请登录后操作");

    }

    return ctx.cachedUser;

  }



  const headerUserId = ctx.request.headers.get("userid") ?? "";

  const headerToken = ctx.request.headers.get("token") ?? "";

  const cookieUserId = ctx.request.cookies.get("user_id")?.value ?? "";

  const cookieToken = ctx.request.cookies.get("token")?.value ?? "";

  const userId = headerUserId || cookieUserId;

  const token = headerToken || cookieToken;



  if (!userId || !token) {

    ctx.cachedUser = null;

    if (must) {

      throwJsonError("请登录后操作");

    }

    return null;

  }



  const tokenRows = await sql<

    {

      user_id: number;

      token: string;

      create_time: number;

    }[]

  >`

    SELECT user_id, token, create_time

    FROM token

    WHERE user_id = ${parseNumber(userId)}

      AND token = ${token}

    LIMIT 1

  `;



  if (tokenRows.length === 0) {

    ctx.cachedUser = null;

    if (must) {

      throwJsonError("请登录后操作");

    }

    return null;

  }



  const tokenInfo = tokenRows[0];

  const userRows = await sql<{ id: number; status: number; group_id: number }[]>`

    SELECT id, status, group_id

    FROM "user"

    WHERE id = ${tokenInfo.user_id}

    LIMIT 1

  `;

  if (userRows.length === 0 || userRows[0].status !== 0) {

    ctx.cachedUser = null;

    if (must) {

      throwJsonError("请登录后操作");

    }

    return null;

  }



  const now = nowUnix();

  if (now > tokenInfo.create_time + 60 * 60 * 24 * 15) {

    await sql`

      DELETE FROM token WHERE user_id = ${tokenInfo.user_id} AND token = ${tokenInfo.token}

    `;

    ctx.cachedUser = null;

    if (must) {

      throwJsonError("请登录后操作");

    }

    return null;

  }



  if (now - tokenInfo.create_time > 864000) {

    await sql`

      UPDATE token

      SET create_time = ${now}

      WHERE user_id = ${tokenInfo.user_id} AND token = ${tokenInfo.token}

    `;

    tokenInfo.create_time = now;

  }



  ctx.cachedUser = {

    user_id: tokenInfo.user_id,

    token: tokenInfo.token,

    create_time: tokenInfo.create_time,

    group_id: parseNumber(userRows[0].group_id, 0)

  };

  return ctx.cachedUser;

}



async function getAdmin(ctx: LegacyContext): Promise<{ id: number; manager: number }> {

  const user = await getUser(ctx, true);

  if (!user) {

    throwJsonError("not permission");

  }

  const rows = await sql<{ id: number; manager: number }[]>`

    SELECT id, manager

    FROM "user"

    WHERE id = ${user.user_id}

      AND manager = 1

    LIMIT 1

  `;

  if (rows.length === 0) {

    throwJsonError("not permission");

  }

  return rows[0];

}



function removeRootUrlFromImages(htmlContent: string, baseUrl: string): string {

  return htmlContent.replace(

    /(<img[^>]*\ssrc=["'])([^"']+)(["'][^>]*>)/gi,

    (match, prefix, src, suffix) => {

      if (src.startsWith("http://") || src.startsWith("https://")) {

        return `${prefix}${src.replace(baseUrl, "")}${suffix}`;

      }

      return match;

    }

  );

}



function addRootUrlToImages(htmlContent: string, baseUrl: string): string {

  return htmlContent.replace(

    /(<img[^>]*\ssrc=["'])([^"']+)(["'][^>]*>)/gi,

    (match, prefix, src, suffix) => {

      if (src.startsWith("http://") || src.startsWith("https://")) {

        return match;

      }

      return `${prefix}${baseUrl}${src}${suffix}`;

    }

  );

}



function getPagination(page: number, limit: number, total: number): Record<string, unknown> {

  const safeLimit = Math.max(1, limit);

  const safePage = Math.max(1, page);

  const lastPage = Math.max(1, Math.ceil(total / safeLimit));

  const normalizedPage = Math.min(safePage, lastPage);

  const from = total === 0 ? 0 : (normalizedPage - 1) * safeLimit + 1;

  const to = total === 0 ? 0 : Math.min(total, normalizedPage * safeLimit);

  return {

    total,

    per_page: safeLimit,

    current_page: normalizedPage,

    last_page: lastPage,

    from,

    to

  };

}



function paginateArray<T>(

  list: T[],

  page: number,

  limit: number

): Record<string, unknown> & { data: T[] } {

  const total = list.length;

  const meta = getPagination(page, limit, total);

  const currentPage = meta.current_page as number;

  const perPage = meta.per_page as number;

  const start = (currentPage - 1) * perPage;

  const data = list.slice(start, start + perPage);

  return { ...meta, data };

}



async function ensureDirectory(directory: string): Promise<void> {

  await mkdir(directory, { recursive: true });

}



async function removeDirectory(directory: string): Promise<void> {

  await rm(directory, { recursive: true, force: true });

}



async function copyDirectory(source: string, destination: string): Promise<void> {

  await ensureDirectory(destination);

  const entries = await readdir(source, { withFileTypes: true });

  for (const entry of entries) {

    const src = path.join(source, entry.name);

    const dest = path.join(destination, entry.name);

    if (entry.isDirectory()) {

      await copyDirectory(src, dest);

      continue;

    }

    if (entry.isFile()) {

      await copyFile(src, dest);

    }

  }

}



async function downloadToFile(sourceUrl: string, targetPath: string): Promise<void> {

  const response = await fetch(sourceUrl, {

    headers: {

      "User-Agent":

        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    }

  });

  if (!response.ok) {

    throw new Error("资源下载失败");

  }

  const data = await response.arrayBuffer();

  await writeFile(targetPath, Buffer.from(data));

}



async function extractZipTo(zipPath: string, destination: string): Promise<void> {

  const zip = new AdmZip(zipPath);

  zip.extractAllTo(destination, true);

}



async function readJsonFile<T>(filePath: string): Promise<T | null> {

  try {

    const buffer = await readFile(filePath);

    const decodeBy = (encoding: string, fatal: boolean): string | null => {
      try {
        const decoder = new TextDecoder(encoding as any, { fatal });
        return decoder.decode(buffer);
      } catch {
        return null;
      }
    };

    const candidates: string[] = [];
    const utf8Strict = decodeBy("utf-8", true);
    if (utf8Strict !== null) {
      candidates.push(utf8Strict);
    }

    for (const encoding of ["gb18030", "gbk"]) {
      const decoded = decodeBy(encoding, false);
      if (decoded !== null) {
        candidates.push(decoded);
      }
    }

    candidates.push(buffer.toString("utf8"));

    for (const raw of candidates) {
      try {
        return JSON.parse(raw) as T;
      } catch {
        // try next candidate
      }
    }

  } catch {

    // ignore and return null

  }

  return null;

}


function sanitizePluginName(name: string): string {

  const safe = sanitizeRelativePublicPath(name);

  return safe.split("/")[0] ?? safe;

}



async function hashFile(absPath: string): Promise<string> {

  const buffer = await readFile(absPath);

  return md5(buffer);

}



async function addFileRecord(webPath: string, userId: number | null): Promise<string | false> {

  const normalizedPath = joinPath("/", sanitizeRelativePublicPath(webPath));

  const absPath = toPublicAbsPath(normalizedPath);

  if (!(await fileExists(absPath))) {

    return false;

  }

  const hash = await hashFile(absPath);

  const existing = await sql<{ id: number; path: string }[]>`

    SELECT id, path

    FROM file

    WHERE hash = ${hash}

    LIMIT 1

  `;

  if (existing.length > 0) {

    if (existing[0].path !== normalizedPath) {

      await unlink(absPath).catch(() => undefined);

    }

    return joinPath("/", existing[0].path);

  }



  const fileStat = await stat(absPath);

  const mimeType = mime.lookup(absPath) || "application/octet-stream";

  await sql`

    INSERT INTO file(path, user_id, create_time, size, hash, mime_type)

    VALUES (

      ${normalizedPath},

      ${userId},

      ${nowDateTimeString()},

      ${fileStat.size},

      ${hash},

      ${String(mimeType)}

    )

  `;

  return normalizedPath;

}



async function deleteFileByPath(webPath: string): Promise<boolean> {

  const normalizedPath = joinPath("/", sanitizeRelativePublicPath(webPath));

  const absPath = toPublicAbsPath(normalizedPath);

  if (await fileExists(absPath)) {

    const hash = await hashFile(absPath);

    await unlink(absPath).catch(() => undefined);

    await sql`

      DELETE FROM file

      WHERE hash = ${hash}

    `;

  }

  return true;

}



async function moveFileRecord(oldPath: string, newPath: string): Promise<boolean> {

  const normalizedOld = joinPath("/", sanitizeRelativePublicPath(oldPath));

  const normalizedNew = joinPath("/", sanitizeRelativePublicPath(newPath));

  const absOld = toPublicAbsPath(normalizedOld);

  const absNew = toPublicAbsPath(normalizedNew);

  if (!(await fileExists(absOld))) {

    return true;

  }

  await ensureDirectory(path.dirname(absNew));

  await rename(absOld, absNew);

  await sql`

    UPDATE file

    SET path = ${normalizedNew}

    WHERE path = ${normalizedOld}

  `;

  return true;

}



async function loadDefaultTabConfig(ctx: LegacyContext): Promise<AnyObject> {

  const defaultPath = settingValue(ctx.settings, "defaultTab", "static/defaultTab.json", true);

  const tryPaths = [defaultPath, "static/defaultTab.json"];

  for (const filePath of tryPaths) {

    const absPath = toPublicAbsPath(filePath);

    if (await fileExists(absPath)) {

      try {

        const text = await readFile(absPath, "utf8");

        return JSON.parse(text) as AnyObject;

      } catch {

        // ignore

      }

    }

  }

  return {};

}



function isOnlyPath(url: string): boolean {

  try {

    const parsed = new URL(url);

    return !parsed.hostname;

  } catch {

    return !/^https?:\/\//i.test(url);

  }

}



function addHttpProtocol(url: string): string {

  if (!url) {

    return url;

  }

  if (/^https?:\/\//i.test(url)) {

    return url;

  }

  if (url.startsWith("//")) {

    return `https:${url}`;

  }

  return `http://${url}`;

}



function addHttpProtocolRemovePath(url: string): string {

  const withProtocol = addHttpProtocol(url);

  try {

    const parsed = new URL(withProtocol);

    const port = parsed.port ? `:${parsed.port}` : "";

    return `${parsed.protocol}//${parsed.hostname}${port}`;

  } catch {

    return withProtocol;

  }

}



async function downloadFileFromUrl(

  ctx: LegacyContext,

  sourceUrl: string,

  targetName: string

): Promise<string | false> {

  const user = await getUser(ctx);

  const folderRelative = joinPath("/images", new Date().toISOString().slice(0, 10).replace(/-/g, "/"));

  const folderAbs = toPublicAbsPath(folderRelative);

  await ensureDirectory(folderAbs);

  const targetAbs = path.join(folderAbs, targetName);

  const response = await fetch(sourceUrl, {

    headers: {

      "User-Agent":

        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    }

  });

  if (!response.ok) {

    return false;

  }

  const arrayBuffer = await response.arrayBuffer();

  await writeFile(targetAbs, Buffer.from(arrayBuffer));

  const filePath = joinPath(folderRelative, targetName);

  return addFileRecord(filePath, user?.user_id ?? null);

}



async function sendMailWithSettings(

  settings: Record<string, string>,

  to: string,

  html: string

): Promise<void> {

  const smtpEmail = settingValue(settings, "smtp_email", "", true);

  const smtpHost = settingValue(settings, "smtp_host", "", true);

  const smtpPort = parseNumber(settingValue(settings, "smtp_port", "465"), 465);

  const smtpPassword = settingValue(settings, "smtp_password", "");

  const smtpSsl = parseNumber(settingValue(settings, "smtp_ssl", "0"), 0);

  if (!smtpEmail || !smtpHost) {

    throw new Error("管理员未配置 SMTP 邮件服务");

  }



  const secure =

    smtpSsl === 2

      ? true

      : smtpSsl === 3

        ? false

        : smtpPort === 465;



  const transporter = nodemailer.createTransport({

    host: smtpHost,

    port: smtpPort,

    secure,

    auth: {

      user: smtpEmail,

      pass: smtpPassword

    },

    tls: {

      rejectUnauthorized: false

    }

  });



  await transporter.sendMail({

    from: `${settingValue(settings, "title", "笨迪导航")} <${smtpEmail}>`,

    to,

    subject: `${settingValue(settings, "title", "笨迪导航")}动态令牌`,

    html

  });

}



async function sendMailByConfig(to: string, html: string, smtp: AnyObject): Promise<void> {

  const smtpEmail = toStringValue(smtp.smtp_email);

  const smtpHost = toStringValue(smtp.smtp_host);

  const smtpPort = parseNumber(smtp.smtp_port, 465);

  const smtpPassword = toStringValue(smtp.smtp_password);

  const smtpSsl = parseNumber(smtp.smtp_ssl, 0);

  const secure =

    smtpSsl === 2

      ? true

      : smtpSsl === 3

        ? false

        : smtpPort === 465;

  const transporter = nodemailer.createTransport({

    host: smtpHost,

    port: smtpPort,

    secure,

    auth: {

      user: smtpEmail,

      pass: smtpPassword

    },

    tls: {

      rejectUnauthorized: false

    }

  });

  await transporter.sendMail({

    from: `测试邮件 <${smtpEmail}>`,

    to,

    subject: "测试邮件",

    html

  });

}



function pickSortOrder(value: string): "asc" | "desc" {

  return value?.toLowerCase() === "asc" ? "asc" : "desc";

}



function sanitizeOrderColumn(

  value: string,

  allowList: string[],

  fallback: string

): string {

  const candidate = value.trim();

  if (allowList.includes(candidate)) {

    return candidate;

  }

  return fallback;

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

function parseTranslations(input: unknown): AnyObject[] {
  const parsed = maybeParseJson<unknown>(input, []);
  return Array.isArray(parsed) ? (parsed as AnyObject[]) : [];
}

async function getDefaultUserGroupId(): Promise<number> {
  try {
    const rows = await sql<{ id: number }[]>`
      SELECT id
      FROM user_group
      WHERE default_user_group = 1
      LIMIT 1
    `;
    return rows[0]?.id ?? 0;
  } catch (error) {
    const fallback = await sql<{ id: number }[]>`
      SELECT id
      FROM user_group
      LIMIT 1
    `;
    return fallback[0]?.id ?? 0;
  }
}


function stringifyJson(value: unknown): string {

  return JSON.stringify(value ?? {});

}



async function loadCardConfig(cardName: string): Promise<AnyObject> {

  const rows = await sql<{ dict_option: string | null }[]>`

    SELECT dict_option

    FROM card

    WHERE name_en = ${cardName}

    LIMIT 1

  `;

  if (rows.length === 0 || !rows[0].dict_option) {

    return {};

  }

  return maybeParseJson<AnyObject>(rows[0].dict_option, {});

}



async function cardConfigValue<T>(

  cardName: string,

  key: string,

  defaultValue: T

): Promise<T> {

  const configs = await loadCardConfig(cardName);

  if (key in configs) {

    return configs[key] as T;

  }

  return defaultValue;

}



async function saveCardConfigs(cardName: string, option: AnyObject): Promise<boolean> {

  const rows = await sql<{ id: number }[]>`

    SELECT id

    FROM card

    WHERE name_en = ${cardName}

    LIMIT 1

  `;

  if (rows.length === 0) {

    return false;

  }

  await sql`

    UPDATE card

    SET dict_option = ${stringifyJson(option)}

    WHERE name_en = ${cardName}

  `;

  return true;

}



async function saveCardConfig(cardName: string, key: string, value: unknown): Promise<boolean> {

  const current = await loadCardConfig(cardName);

  current[key] = value;

  return saveCardConfigs(cardName, current);

}



function shouldRenderIndex(pathSegments: string[]): boolean {

  if (pathSegments.length === 0) {

    return true;

  }

  const first = pathSegments[0].toLowerCase();

  if (first === "manager" || first === "noteapp") {

    return true;

  }

  if (first === "index" && pathSegments[1]?.toLowerCase() === "index") {

    return true;

  }

  return false;

}



async function renderIndexHtml(ctx: LegacyContext): Promise<NextResponse> {

  const template = await loadTextFileCached(toPublicAbsPath("dist/index.html"));

  const title = settingValue(ctx.settings, "title", "笨迪导航");

  const keywords = settingValue(ctx.settings, "keywords", "笨迪导航,新标签页,导航页");

  const description = settingValue(ctx.settings, "description", "笨迪导航 - 可自部署的导航与新标签页");

  let customHead = settingValue(ctx.settings, "customHead", "");

  if (settingValue(ctx.settings, "pwa", "0") === "1") {

    customHead += '<link rel="manifest" href="/manifest.json">';

  }

  const favicon = resolveBrandAssetPath(settingValue(

    ctx.settings,

    "favicon",

    settingValue(ctx.settings, "logo", DEFAULT_BRAND_ICON),

    true

  ), DEFAULT_BRAND_ICON);

  const html = template

    .replace(/\{\$title\}/g, title)

    .replace(/\{\$keywords\}/g, keywords)

    .replace(/\{\$description\}/g, description)

    .replace(/\{\$version\}/g, APP_VERSION)

    .replace(/\{\$customHead\|raw\}/g, customHead)

    .replace(/\{\$favicon\}/g, favicon);

  return buildFileResponse(html, "text/html; charset=utf-8");

}



async function renderPrivacyHtml(ctx: LegacyContext): Promise<NextResponse> {

  const template = await loadTextFileCached(path.join(ROOT_DIR, "app", "view", "privacy.html"));

  const title = settingValue(ctx.settings, "title", "笨迪导航");

  const logo = resolveBrandAssetPath(
    settingValue(ctx.settings, "logo", DEFAULT_BRAND_ICON, true),
    DEFAULT_BRAND_ICON
  );

  let content = settingValue(ctx.settings, "privacy", "");

  if (!content.trim()) {

    const defaultTermsPath = path.join(ROOT_DIR, "docs", "SERVICE_TERMS.html");

    if (await fileExists(defaultTermsPath)) {

      content = await loadTextFileCached(defaultTermsPath);

    }

  }

  const html = template

    .replace(/\{\$title\}/g, title)

    .replace(/\{\$logo\}/g, logo)

    .replace(/\{\$content\|raw\}/g, content);

  return buildFileResponse(html, "text/html; charset=utf-8");

}



async function renderQqLoginHtml(info: { user_id: number; token: string }): Promise<NextResponse> {

  const template = await loadTextFileCached(path.join(ROOT_DIR, "app", "view", "qq_login.html"));

  const html = template

    .replace(/\{\$info\.user_id\}/g, String(info.user_id))

    .replace(/\{\$info\.token\}/g, info.token);

  return buildFileResponse(html, "text/html; charset=utf-8");

}



async function renderQqLoginErrorHtml(): Promise<NextResponse> {

  const template = await loadTextFileCached(path.join(ROOT_DIR, "app", "view", "qq_login_error.html"));

  return buildFileResponse(template, "text/html; charset=utf-8");

}



async function renderCardNotFoundHtml(): Promise<NextResponse> {

  const template = await loadTextFileCached(path.join(ROOT_DIR, "app", "view", "cardNotFound.html"));

  return buildFileResponse(template, "text/html; charset=utf-8");

}



async function getSiteData(ctx: LegacyContext): Promise<AnyObject> {

  return {
    email: settingValue(ctx.settings, "email", ""),
    qqGroup: settingValue(ctx.settings, "qqGroup", ""),
    beianMps: settingValue(ctx.settings, "beianMps", ""),
    copyright: settingValue(ctx.settings, "copyright", ""),
    recordNumber: settingValue(ctx.settings, "recordNumber", ""),
    mobileRecordNumber: settingValue(ctx.settings, "mobileRecordNumber", "0"),
    auth: ctx.auth,
    def_user_avatar: resolveBrandAssetPath(
      settingValue(ctx.settings, "def_user_avatar", DEFAULT_GUEST_AVATAR, true),
      DEFAULT_GUEST_AVATAR
    ),
    logo: resolveBrandAssetPath(
      settingValue(ctx.settings, "logo", DEFAULT_BRAND_ICON, true),
      DEFAULT_BRAND_ICON
    ),
    qq_login: settingValue(ctx.settings, "qq_login", "0"),
    wx_login: settingValue(ctx.settings, "wx_login", "0"),
    loginCloseRecordNumber: settingValue(ctx.settings, "loginCloseRecordNumber", "0"),
    is_push_link_store:
      ctx.auth ? settingValue(ctx.settings, "is_push_link_store", "0") : "0",
    is_push_link_store_tips: settingValue(ctx.settings, "is_push_link_store_tips", "0"),
    is_push_link_status: settingValue(ctx.settings, "is_push_link_status", "0"),
    google_ext_link: settingValue(ctx.settings, "google_ext_link", ""),
    edge_ext_link: settingValue(ctx.settings, "edge_ext_link", ""),
    local_ext_link: settingValue(ctx.settings, "local_ext_link", ""),
    customAbout: settingValue(ctx.settings, "customAbout", ""),
    user_register: settingValue(ctx.settings, "user_register", "0", true),
    auth_check: settingValue(ctx.settings, "auth_check", "0", true),
    tip: {
      ds_status: settingValue(ctx.settings, "ds_status", "0", true),
      ds_template: settingValue(ctx.settings, "ds_template", "org", true),
      ds_alipay_img: settingValue(ctx.settings, "ds_alipay_img", "", true),
      ds_wx_img: settingValue(ctx.settings, "ds_wx_img", "", true),
      ds_custom_url: settingValue(ctx.settings, "ds_custom_url", "", true),
      ds_title: settingValue(ctx.settings, "ds_title", "", true),
      ds_tips: settingValue(ctx.settings, "ds_tips", "", true)
    },
    translations: parseTranslations(settingValue(ctx.settings, "translations", "[]", true))
  };
}


async function decorateLinkData(linkData: unknown): Promise<unknown> {

  const list = Array.isArray(linkData) ? [...linkData] : [];

  if (list.length === 0) {

    return list;

  }

  const apps = await sql<

    {

      id: number;

      custom: unknown;

      url: string | null;

      src: string | null;

      name: string | null;

      bgColor: string | null;

    }[]

  >`

    SELECT id, custom, url, src, name, "bgColor"

    FROM linkstore

    WHERE app = 1

  `;

  const appMap = new Map<number, (typeof apps)[number]>();

  for (const appItem of apps) {

    appMap.set(appItem.id, appItem);

  }



  return list.map((entry) => {

    if (!entry || typeof entry !== "object") {

      return entry;

    }

    const item = { ...(entry as Record<string, unknown>) };

    if (

      parseNumber(item.app, 0) === 1 &&

      parseNumber(item.origin_id, 0) > 0 &&

      item.type === "icon"

    ) {

      const appInfo = appMap.get(parseNumber(item.origin_id, 0));

      if (appInfo) {

        item.custom = appInfo.custom ?? {};

        item.url = appInfo.url ?? "";

        item.src = appInfo.src ?? "";

        item.name = appInfo.name ?? "";

        item.bgColor = appInfo.bgColor ?? "";

      }

    }

    return item;

  });

}



async function getLinkDataForUser(ctx: LegacyContext): Promise<unknown> {

  const user = await getUser(ctx);

  if (user) {

    const cacheKey = `Link.${user.user_id}`;

    const cached = memoryCache.get(cacheKey);

    if (cached !== null) {

      return cached;

    }

    const rows = await sql<{ link: unknown }[]>`

      SELECT link FROM link WHERE user_id = ${user.user_id} LIMIT 1

    `;

    if (rows.length > 0) {

      const data = await decorateLinkData(rows[0].link ?? []);

      memoryCache.set(cacheKey, data, 60 * 60);

      return data;

    }

  }

  const defaults = await loadDefaultTabConfig(ctx);

  return (defaults.link as unknown[]) ?? [];

}



async function getTabbarDataForUser(ctx: LegacyContext): Promise<unknown> {

  const user = await getUser(ctx);

  if (user) {

    const rows = await sql<{ tabs: unknown }[]>`

      SELECT tabs FROM tabbar WHERE user_id = ${user.user_id} LIMIT 1

    `;

    if (rows.length > 0) {

      return rows[0].tabs ?? [];

    }

  }

  const defaults = await loadDefaultTabConfig(ctx);

  return (defaults.tabbar as unknown[]) ?? [];

}



async function getConfigDataForUser(ctx: LegacyContext): Promise<unknown> {

  const user = await getUser(ctx);

  if (user) {

    const rows = await sql<{ config: unknown }[]>`

      SELECT config FROM config WHERE user_id = ${user.user_id} LIMIT 1

    `;

    if (rows.length > 0) {

      return rows[0].config ?? {};

    }

  }

  const defaults = await loadDefaultTabConfig(ctx);

  return (defaults.config as AnyObject) ?? {};

}



async function handleIndexController(ctx: LegacyContext, action: string): Promise<NextResponse> {

  switch (action.toLowerCase()) {

    case "index":

      return renderIndexHtml(ctx);

    case "all": {

      const ids = toArray<string>(deepGet(ctx.requestData.body, "ids", []));

      const payload: AnyObject = {};

      if (!ids.includes("link")) {

        payload.link = await getLinkDataForUser(ctx);

      }

      if (!ids.includes("tabbar")) {

        payload.tabbar = await getTabbarDataForUser(ctx);

      }

      if (!ids.includes("config")) {

        payload.config = await getConfigDataForUser(ctx);

      }

      await syncLocalPluginCards(true);

      const cards = await sql<{ name_en: string; status: number }[]>`

        SELECT name_en, status

        FROM card

        WHERE status = 1

      `;

      payload.card = cards;

      payload.site = await getSiteData(ctx);

      return jsonSuccess("ok", payload);

    }

    case "privacy":
      return renderPrivacyHtml(ctx);
    case "classfoldericons": {
      const defaults = [
        { src: "/static/pageGroup/home.svg", name: "主页" },
        { src: "/static/pageGroup/game.svg", name: "游戏" },
        { src: "/static/pageGroup/music.svg", name: "音乐" },
        { src: "/static/pageGroup/work.svg", name: "办公" },
        { src: "/static/pageGroup/chat.svg", name: "社交" },
        { src: "/static/pageGroup/shop.svg", name: "购物" },
        { src: "/static/pageGroup/travel.svg", name: "出行" },
        { src: "/static/pageGroup/all.svg", name: "综合" },
        { src: "/static/pageGroup/read.svg", name: "阅读" },
        { src: "/static/pageGroup/astronomy.svg", name: "天文" },
        { src: "/static/pageGroup/safe.svg", name: "安全" },
        { src: "/static/pageGroup/crown.svg", name: "王冠" },
        { src: "/static/pageGroup/shanzi.svg", name: "扇子" },
        { src: "/static/pageGroup/photo.svg", name: "图片" },
        { src: "/static/pageGroup/star.svg", name: "星星" },
        { src: "/static/pageGroup/liwu.svg", name: "礼物" },
        { src: "/static/pageGroup/code.svg", name: "代码" },
        { src: "/static/pageGroup/movie.svg", name: "电影" },
        { src: "/static/pageGroup/hiuzhang.svg", name: "徽章" },
        { src: "/static/pageGroup/study.svg", name: "学习" },
        { src: "/static/pageGroup/kongjian.svg", name: "空间" },
        { src: "/static/pageGroup/faxian.svg", name: "发现" },
        { src: "/static/pageGroup/computer.svg", name: "计算机" },
        { src: "/static/pageGroup/xiuxian.svg", name: "休闲" },
        { src: "/static/pageGroup/geren.svg", name: "个人空间" }
      ];
      const config = settingValue(ctx.settings, "classFolderIcons", "");
      const parsed = config ? maybeParseJson<AnyObject[]>(config, defaults) : defaults;
      const result = Array.isArray(parsed) ? parsed : defaults;
      return jsonSuccess("ok", result);
    }
    case "favicon": {
      const favicon = resolveBrandAssetPath(
        settingValue(
          ctx.settings,
          "favicon",
          settingValue(ctx.settings, "logo", DEFAULT_BRAND_ICON),
          true
        ),
        DEFAULT_BRAND_ICON
      );
      if (favicon) {

        if (/^https?:\/\//i.test(favicon)) {
          return NextResponse.redirect(favicon);
        }

        if (favicon.startsWith("//")) {
          return NextResponse.redirect(`https:${favicon}`);
        }

        const abs = toPublicAbsPath(favicon);

        if (await fileExists(abs)) {

          const buffer = await readFile(abs);

          const type = mime.lookup(abs) || "application/octet-stream";

          return buildFileResponse(buffer, String(type), 60 * 60 * 24);

        }

      }

      return NextResponse.redirect(new URL(DEFAULT_BRAND_ICON, ctx.request.url));

    }

    case "manifest": {

      const payload = {

        name: settingValue(ctx.settings, "title", "笨迪导航"),

        short_name: settingValue(ctx.settings, "title", "笨迪导航"),

        description: settingValue(ctx.settings, "description", "笨迪导航 - 可自部署的导航与新标签页"),

        manifest_version: 2,

        version: APP_VERSION,

        theme_color: settingValue(ctx.settings, "theme_color", "#141414"),

        icons: [

          {

            src: settingValue(

              ctx.settings,

              "favicon",

              settingValue(ctx.settings, "logo", "/favicon.ico")

            ),

            sizes: "144x144"

          }

        ],

        display: "standalone",

        orientation: "portrait",

        start_url: "/",

        scope: "/",

        permissions: ["geolocation", "notifications"]

      };

      return NextResponse.json(payload);

    }

    default:

      return jsonError("not action");

  }

}



async function handleApiController(ctx: LegacyContext, action: string): Promise<NextResponse> {

  switch (action.toLowerCase()) {

    case "site":
      return jsonSuccess("ok", await getSiteData(ctx));
    case "wx_login_info": {
      const appid = settingValue(ctx.settings, "wx_login_appid", "");
      const redirect_uri = ctx.request.nextUrl.origin;
      return jsonSuccess("ok", { appid, redirect_uri });
    }
    case "background":
      return servePublicFile("static/background.jpeg", 60 * 60 * 24 * 3);
    case "defbg": {

      const defaults = await loadDefaultTabConfig(ctx);

      const background = deepGet(defaults, "config.theme.backgroundImage", "static/background.jpeg");

      const mimeType = deepGet(defaults, "config.theme.backgroundMime", 0);

      return jsonSuccess("ok", { background, mime: mimeType });

    }

    case "globalnotify": {

      const raw = settingValue(ctx.settings, "globalNotify", "");

      if (!raw) {

        return jsonError("empty");

      }

      const parsed = maybeParseJson<AnyObject>(raw, {});

      const html = addRootUrlToImages(toStringValue(parsed.html, ""), rootUrl(ctx.request));

      if (parseNumber(parsed.status, 0) === 1) {

        return jsonSuccess("ok", JSON.stringify({ ...parsed, html }));

      }

      return jsonError("empty");

    }

    case "getmailcode": {

      const mail = toStringValue(deepGet(ctx.requestData.body, "mail", "")).trim();

      if (!mail) {

        return jsonError("发送失败");

      }

      const lockKey = `code${mail}`;

      if (memoryCache.get(lockKey) !== null) {

        return jsonSuccess("请勿频繁获取验证码");

      }

      const code = String(Math.floor(Math.random() * 900000) + 100000);

      const customTemplate = settingValue(ctx.settings, "smtp_code_template", "");

      const html = (customTemplate || `

        <div style="border:1px solid #DEDEDE;border-top:3px solid #009944;padding:25px;background-color:#FFF;">

          <div style="font-size:17px;font-weight:bold;">邮箱验证码</div>

          <div style="font-size:14px;line-height:36px;padding-top:15px;padding-bottom:15px;">

            尊敬的用户，您好：<br/>

            您的验证码是：<b style="color:#1e9fff">${code}</b>，5 分钟内有效，请尽快验证。

          </div>

          <div style="line-height:15px;">此致</div>

        </div>

      `).replace(/\{\$code\}/g, code);

      try {

        await sendMailWithSettings(ctx.settings, mail, html);

        memoryCache.set(lockKey, code, 300);

        return jsonSuccess("发送成功");

      } catch (error) {

        return jsonError(error instanceof Error ? error.message : "发送失败");

      }

    }

    case "geticon": {

      const avatar = toStringValue(deepGet(ctx.requestData.body, "avatar", ""));

      if (avatar) {

        const remoteAvatar = settingValue(

          ctx.settings,

          "remote_avatar",

          "https://avatar.mtab.cc/6.x/icons/png?seed=",

          true

        );

        const target = await downloadFileFromUrl(ctx, `${remoteAvatar}${avatar}`, `${md5(avatar)}.png`);

        if (target) {

          return jsonSuccess({ src: target });

        }

      }



      const rawUrl = toStringValue(deepGet(ctx.requestData.body, "url", "")).trim();

      if (!rawUrl) {

        return jsonError("没有抓取到图标");

      }

      const realUrl = addHttpProtocolRemovePath(rawUrl);

      const cdn = settingValue(ctx.settings, "assets_host", "");

      let icon = "";

      let title = "";

      try {

        const response = await fetch(realUrl, {

          headers: {

            "User-Agent":

              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

          }

        });

        if (response.ok) {

          const type = response.headers.get("content-type") ?? "";

          if (type.toLowerCase().includes("text/html")) {

            const html = await response.text();

            const $ = loadHtml(html);

            title = $("title").first().text() ?? "";

            const links = [

              'link[rel="icon"]',

              'link[rel="shortcut icon"]',

              'link[rel="apple-touch-icon"]',

              'link[rel="apple-touch-icon-precomposed"]',

              'link[rel="mask-icon"]'

            ];

            for (const selector of links) {

              const iconHref = $(selector).first().attr("href");

              if (!iconHref) {

                continue;

              }

              const resolved = isOnlyPath(iconHref)

                ? `${realUrl.replace(/\/+$/, "")}/${iconHref.replace(/^\/+/, "")}`

                : addHttpProtocol(iconHref);

              const iconResponse = await fetch(resolved, {

                headers: {

                  "User-Agent":

                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

                }

              });

              if (!iconResponse.ok) {

                continue;

              }

              const iconType = iconResponse.headers.get("content-type") ?? "";

              const extensionMap: Record<string, string> = {

                "image/png": "png",

                "image/jpeg": "jpg",

                "image/jpg": "jpg",

                "image/x-icon": "ico",

                "image/vnd.microsoft.icon": "ico",

                "image/svg+xml": "svg",

                "image/webp": "webp"

              };

              const ext = extensionMap[iconType.split(";")[0].toLowerCase()];

              if (!ext) {

                continue;

              }

              const targetPath = await downloadFileFromUrl(

                ctx,

                resolved,

                `${md5(realUrl)}.${ext}`

              );

              if (targetPath) {

                icon = `${cdn}${targetPath}`;

                break;

              }

            }

          }

        }

        if (!icon) {

          const fallback = `${realUrl.replace(/\/+$/, "")}/favicon.ico`;

          const targetPath = await downloadFileFromUrl(ctx, fallback, `${md5(realUrl)}.ico`);

          if (targetPath) {

            icon = `${cdn}${targetPath}`;

          }

        }

      } catch {

        // ignore

      }

      if (icon) {

        return jsonSuccess({ src: icon, name: title });

      }

      return jsonError("没有抓取到图标");

    }

    case "renderico": {

      const seed = toStringValue(deepGet(ctx.requestData.query, "seed", ""));

      const remoteAvatar = settingValue(

        ctx.settings,

        "remote_avatar",

        "https://avatar.mtab.cc/6.x/icons/png?seed=",

        true

      );

      const response = await fetch(`${remoteAvatar}${encodeURIComponent(seed)}`);

      if (!response.ok) {

        return new NextResponse("", { status: 500 });

      }

      const data = await response.arrayBuffer();

      return buildFileResponse(

        Buffer.from(data),

        response.headers.get("content-type") ?? "image/png"

      );

    }

    case "refresh": {

      const user = await getUser(ctx);

      if (!user) {

        return jsonError("not login");

      }

      const rows = await sql<{ update_time: string | null }[]>`

        SELECT update_time

        FROM link

        WHERE user_id = ${user.user_id}

        LIMIT 1

      `;

      return jsonSuccess("ok", {

        link_update_time: rows[0]?.update_time ?? null

      });

    }

    case "cardimages": {

      const target = toPublicAbsPath("static/CardBackground/bg");

      const files = await readdir(target);

      const result: { thumbor: string; url: string; mtime: number }[] = [];

      for (const file of files) {

        const abs = path.join(target, file);

        const st = await stat(abs);

        if (st.isFile()) {

          const web = joinPath("/static/CardBackground/bg", file);

          result.push({ thumbor: web, url: web, mtime: st.mtimeMs });

        }

      }

      result.sort((a, b) => b.mtime - a.mtime);

      return jsonSuccess(

        result.map(({ thumbor, url }) => ({ thumbor, url }))

      );

    }

    case "movefile": {

      await getAdmin(ctx);

      const oldPath = toStringValue(deepGet(ctx.requestData.body, "old", ""));

      const newPath = toStringValue(deepGet(ctx.requestData.body, "new", ""));

      await moveFileRecord(oldPath, newPath);

      return jsonSuccess("文件移动成功");

    }

    case "delimages": {

      await getAdmin(ctx);

      const url = toStringValue(deepGet(ctx.requestData.body, "url", ""));

      if (url) {

        await deleteFileByPath(url);

      }

      return jsonSuccess("删除完毕");

    }

    case "upload": {

      const user = await getUser(ctx);

      if (!user && settingValue(ctx.settings, "touristUpload", "0") !== "1") {

        return jsonError("管理员已关闭游客上传，请登录后使用");

      }

      const uploadFile = ctx.requestData.files.get("file");

      if (!uploadFile) {

        return jsonError("not File");

      }

      const maxSizeMb = parseFloat(settingValue(ctx.settings, "upload_size", "2") || "2");

      if (uploadFile.size > 1024 * 1024 * maxSizeMb) {

        const label = maxSizeMb < 1 ? `${maxSizeMb * 1000}KB` : `${maxSizeMb}MB`;

        return jsonError(`文件最大${label},请压缩后再试`);

      }



      const extension = path.extname(uploadFile.name).replace(".", "").toLowerCase();

      const allow = ["png", "jpg", "jpeg", "webp", "ico", "svg"];

      if (!allow.includes(extension)) {

        return jsonError("上传失败");

      }

      const savePath = joinPath("/images", new Date().toISOString().slice(0, 10).replace(/-/g, "/"));

      const saveAbs = toPublicAbsPath(savePath);

      await ensureDirectory(saveAbs);

      const fileName = `${randomUUID().replace(/-/g, "")}.${extension}`;

      const filePath = joinPath(savePath, fileName);

      const absPath = toPublicAbsPath(filePath);

      const buffer = Buffer.from(await uploadFile.arrayBuffer());

      await writeFile(absPath, buffer);



      const upType = toStringValue(ctx.request.headers.get("up-type"), "");

      const calc = toStringValue(ctx.request.headers.get("calc"), "");

      let minPath = "";



      if (["icon", "avatar"].includes(upType) && extension !== "svg" && extension !== "ico") {

        await sharp(absPath).resize({ width: 144 }).toFile(`${absPath}.tmp`);

        await rename(`${absPath}.tmp`, absPath);

      } else if (upType === "AdminBackground" && extension !== "svg" && extension !== "ico") {

        const minFilePath = joinPath(savePath, `min_${fileName}`);

        const minAbs = toPublicAbsPath(minFilePath);

        await sharp(absPath).resize({ width: 400 }).toFile(minAbs);

        const minRecord = await addFileRecord(minFilePath, user?.user_id ?? null);

        if (minRecord) {

          minPath = minRecord;

        }

      }



      if (calc && extension !== "svg" && extension !== "ico") {

        const [wRaw, hRaw] = calc.split("x");

        const width = parseNumber(wRaw, 0);

        const height = parseNumber(hRaw, 0);

        if (width > 0 && height > 0) {

          await sharp(absPath).resize({ width, height, fit: "fill" }).toFile(`${absPath}.tmp`);

          await rename(`${absPath}.tmp`, absPath);

        }

      }



      const record = await addFileRecord(filePath, user?.user_id ?? null);

      return jsonSuccess({

        url: record,

        minUrl: minPath,

        filename: fileName

      });

    }

    case "adminupload": {

      const admin = await getAdmin(ctx);

      const uploadFile = ctx.requestData.files.get("file");

      if (!uploadFile) {

        return jsonError("not File");

      }

      if (uploadFile.size > 1024 * 1024 * 8) {

        return jsonError("文件最大8MB,请压缩后再试");

      }

      const extension = path.extname(uploadFile.name).replace(".", "").toLowerCase();

      const disk = toStringValue(deepGet(ctx.requestData.body, "disk", "images")).trim() || "images";

      const dir = toStringValue(deepGet(ctx.requestData.body, "dir", "")).trim();

      let savePath = joinPath(`/${disk}`, "");

      if (dir) {

        savePath = joinPath(savePath, dir);

      } else {

        savePath = joinPath(savePath, new Date().toISOString().slice(0, 10).replace(/-/g, "/"));

      }

      const saveAbs = toPublicAbsPath(savePath);

      await ensureDirectory(saveAbs);

      const fileName = `${randomUUID().replace(/-/g, "")}.${extension}`;

      const filePath = joinPath(savePath, fileName);

      await writeFile(toPublicAbsPath(filePath), Buffer.from(await uploadFile.arrayBuffer()));

      const record = await addFileRecord(filePath, admin.id);

      const cdn = settingValue(ctx.settings, "assets_host", "/", true);

      return jsonSuccess({ url: `${cdn}${record}` });

    }

    default:

      return jsonError("not action");

  }

}



async function refreshToken(userInfo: AnyObject, ctx: LegacyContext): Promise<AnyObject> {

  const token = randomToken(String(userInfo.id));

  const createTime = nowUnix();

  const userAgent = toStringValue(ctx.request.headers.get("user-agent"), "").slice(0, 250);

  const ip = getRealIp(ctx.request);

  const accessToken = toStringValue(userInfo.access_token, "");

  await sql`

    INSERT INTO token(user_id, token, create_time, ip, user_agent, access_token)

    VALUES (

      ${parseNumber(userInfo.id)},

      ${token},

      ${createTime},

      ${ip},

      ${userAgent},

      ${accessToken || null}

    )

  `;

  return {

    user_id: parseNumber(userInfo.id),

    token,

    create_time: createTime

  };

}


function wxLoginCacheKey(state: string): string {
  return `wx_login:${state}`;
}

function setWxLoginState(state: string, payload: AnyObject, ttlSeconds = 600): void {
  if (!state) {
    return;
  }
  memoryCache.set(wxLoginCacheKey(state), payload, ttlSeconds);
}

function getWxLoginState(state: string): AnyObject | null {
  if (!state) {
    return null;
  }
  return (memoryCache.get(wxLoginCacheKey(state)) as AnyObject) ?? null;
}

async function downloadAvatarFromUrl(ctx: LegacyContext, sourceUrl: string): Promise<string> {
  if (!sourceUrl) {
    return "";
  }
  const response = await fetch(sourceUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
  });
  if (!response.ok) {
    return "";
  }
  const contentType = response.headers.get("content-type") ?? "";
  const extensionMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp"
  };
  const ext = extensionMap[contentType.split(";")[0].toLowerCase()] ?? "png";
  const buffer = Buffer.from(await response.arrayBuffer());
  const folderRelative = joinPath("/images", new Date().toISOString().slice(0, 10).replace(/-/g, "/"));
  const folderAbs = toPublicAbsPath(folderRelative);
  await ensureDirectory(folderAbs);
  const targetName = `${md5(sourceUrl)}.${ext}`;
  const targetAbs = path.join(folderAbs, targetName);
  await writeFile(targetAbs, buffer);
  const filePath = joinPath(folderRelative, targetName);
  const record = await addFileRecord(filePath, null);
  return record ? String(record) : filePath;
}

async function fetchWxAccessToken(appId: string, secret: string, code: string): Promise<AnyObject | null> {
  if (!appId || !secret || !code) {
    return null;
  }
  const url = new URL("https://api.weixin.qq.com/sns/oauth2/access_token");
  url.searchParams.set("appid", appId);
  url.searchParams.set("secret", secret);
  url.searchParams.set("code", code);
  url.searchParams.set("grant_type", "authorization_code");
  const response = await fetch(url.toString());
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as AnyObject;
}

async function fetchWxUserInfo(accessToken: string, openid: string): Promise<AnyObject | null> {
  if (!accessToken || !openid) {
    return null;
  }
  const url = new URL("https://api.weixin.qq.com/sns/userinfo");
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("openid", openid);
  const response = await fetch(url.toString());
  if (!response.ok) {
    return null;
  }
  const json = (await response.json()) as AnyObject;
  if (!json || !json.openid) {
    return null;
  }
  return json;
}

async function handleWxLogin(ctx: LegacyContext): Promise<NextResponse> {
  const code = toStringValue(deepGet(ctx.requestData.query, "code", "")).trim();
  const state = toStringValue(deepGet(ctx.requestData.query, "state", "")).trim();
  const mode = toStringValue(deepGet(ctx.requestData.query, "mode", "")).trim();
  const appid = settingValue(ctx.settings, "wx_login_appid", "");
  const secret = settingValue(ctx.settings, "wx_login_appkey", "");
  const userId = parseNumber(deepGet(ctx.requestData.query, "user_id", 0), 0);
  const token = toStringValue(deepGet(ctx.requestData.query, "token", ""));

  if (!code || !state) {
    setWxLoginState(state, { type: "wx_login", status: 2, msg: "?????????" });
    return new NextResponse("");
  }

  const tokenInfo = await fetchWxAccessToken(appid, secret, code);
  const openid = toStringValue(tokenInfo?.openid, "");
  if (!openid) {
    setWxLoginState(state, { type: "wx_login", status: 2, msg: "?????????" });
    return new NextResponse("");
  }

  const accessToken = toStringValue(tokenInfo?.access_token, "");
  const unionid = toStringValue(tokenInfo?.unionid, "");

  let userRow = await sql<AnyObject[]>`
    SELECT * FROM "user" WHERE wx_open_id = ${openid} LIMIT 1
  `;

  if (userRow.length > 0) {
    if (mode === "bind") {
      setWxLoginState(state, { type: "wx_login", status: 0, msg: "??????????" });
      return new NextResponse("");
    }
    await sql`
      UPDATE "user"
      SET login_ip = ${getRealIp(ctx.request)},
          login_time = ${nowDateTimeString()},
          login_fail_count = 0
      WHERE id = ${userRow[0].id}
    `;
  } else {
    if (mode === "bind") {
      if (!userId || !token) {
        setWxLoginState(state, { type: "wx_login", status: 0, msg: "?????" });
        return new NextResponse("");
      }
      const authRows = await sql`
        SELECT user_id FROM token WHERE user_id = ${userId} AND token = ${token} LIMIT 1
      `;
      if (authRows.length === 0) {
        setWxLoginState(state, { type: "wx_login", status: 0, msg: "?????" });
        return new NextResponse("");
      }
      await sql`
        UPDATE "user"
        SET wx_open_id = ${openid},
            wx_unionid = ${unionid}
        WHERE id = ${userId}
      `;
      userRow = await sql<AnyObject[]>`
        SELECT * FROM "user" WHERE id = ${userId} LIMIT 1
      `;
    } else {
      const wxInfo = await fetchWxUserInfo(accessToken, openid);
      if (!wxInfo) {
        setWxLoginState(state, { type: "wx_login", status: 2, msg: "????????" });
        return new NextResponse("");
      }
      const avatarUrl = toStringValue(wxInfo.headimgurl, "");
      const avatar = avatarUrl ? await downloadAvatarFromUrl(ctx, avatarUrl) : "";
      const nickname = toStringValue(wxInfo.nickname, "");
      const defaultGroupId = await getDefaultUserGroupId();
      const rows = await sql<AnyObject[]>`
        INSERT INTO "user"(mail, password, create_time, login_ip, register_ip, wx_open_id, wx_unionid, avatar, nickname, group_id)
        VALUES (
          ${null},
          ${md5(String(Date.now()))},
          ${nowDateTimeString()},
          ${getRealIp(ctx.request)},
          ${getRealIp(ctx.request)},
          ${openid},
          ${unionid},
          ${avatar},
          ${nickname},
          ${defaultGroupId}
        )
        RETURNING *
      `;
      userRow = rows;
    }
  }

  if (userRow.length === 0) {
    setWxLoginState(state, { type: "wx_login", status: 2, msg: "?????????" });
    return new NextResponse("");
  }

  const info = { ...userRow[0], access_token: accessToken } as AnyObject;
  const auth = await refreshToken(info, ctx);
  setWxLoginState(state, {
    type: "wx_login",
    status: 1,
    msg: "????",
    mode,
    openid: info.wx_open_id,
    id: info.id,
    token: auth
  });
  return new NextResponse("");
}


async function handleUserController(ctx: LegacyContext, action: string): Promise<NextResponse> {

  switch (action.toLowerCase()) {

    case "login": {

      const username = toStringValue(deepGet(ctx.requestData.body, "username", "0")).trim();

      const password = toStringValue(deepGet(ctx.requestData.body, "password", "0")).trim();

      const lockKey = `login.${username}`;

      if (memoryCache.get(lockKey) !== null) {

        return jsonError("账号已被安全锁定,您可以修改密码然后登录");

      }

      const rows = await sql<

        {

          id: number;

          mail: string;

          password: string;

          status: number;

          login_fail_count: number;

        }[]

      >`

        SELECT id, mail, password, status, login_fail_count

        FROM "user"

        WHERE mail = ${username}

        LIMIT 1

      `;

      if (rows.length === 0) {

        return jsonError("账号不存在");

      }

      const info = rows[0];

      if (info.login_fail_count === 10) {

        memoryCache.set(lockKey, "lock", 7200);

        await sql`

          UPDATE "user"

          SET login_fail_count = 0

          WHERE id = ${info.id}

        `;

        return jsonError("账号已被锁定2小时");

      }

      if (info.password !== md5(password)) {

        await sql`

          UPDATE "user"

          SET login_fail_count = login_fail_count + 1

          WHERE id = ${info.id}

        `;

        return jsonError("账号不存在或密码错误");

      }

      if (info.status === 1) {

        return jsonError("账号已被冻结");

      }

      const auth = await refreshToken(info as AnyObject, ctx);

      await sql`

        UPDATE "user"

        SET login_ip = ${getRealIp(ctx.request)},

            login_time = ${nowDateTimeString()},

            login_fail_count = 0

        WHERE id = ${info.id}

      `;

      return jsonSuccess("登录成功", auth);

    }

    
    case "register": {

      if (settingValue(ctx.settings, "user_register", "0", true) === "1") {

        return jsonError("????????????");

      }

      const username = toStringValue(deepGet(ctx.requestData.body, "username", "")).trim();

      const password = toStringValue(deepGet(ctx.requestData.body, "password", "")).trim();

      const code = toStringValue(deepGet(ctx.requestData.body, "code", "0000"));

      if (!username || !password) {

        return jsonError("????");

      }

      if (!validateEmail(username)) {

        return jsonError("??????");

      }

      if (password.length < 6) {

        return jsonError("????");

      }

      const authCheck = settingValue(ctx.settings, "auth_check", "0", true);
      const devBypass = process.env.NODE_ENV !== "production" && code === "0000";

      if (authCheck === "0" && !devBypass) {

        const cacheCode = memoryCache.get(`code${username}`);

        if (!cacheCode || String(cacheCode) !== code) {

          return jsonError("?????");

        }

      }

      const existing = await sql<{ id: number }[]>`

        SELECT id FROM "user" WHERE mail = ${username} LIMIT 1

      `;

      if (existing.length > 0) {

        return jsonError("?????");

      }

      const defaultGroupId = await getDefaultUserGroupId();

      await sql`

        INSERT INTO "user"(mail, password, create_time, register_ip, group_id)

        VALUES (

          ${username},

          ${md5(password)},

          ${nowDateTimeString()},

          ${getRealIp(ctx.request)},

          ${defaultGroupId}

        )

      `;

      memoryCache.delete(`code${username}`);

      return jsonSuccess("ok");

    }

    case "forgetpass": {

      const username = toStringValue(deepGet(ctx.requestData.body, "username", "")).trim();

      const password = toStringValue(deepGet(ctx.requestData.body, "password", "")).trim();

      const code = toStringValue(deepGet(ctx.requestData.body, "code", "0000"));

      const oldPassword = toStringValue(deepGet(ctx.requestData.body, "oldPassword", "")).trim();

      if (!username || !password) {

        return jsonError("????");

      }

      if (!validateEmail(username)) {

        return jsonError("??????");

      }

      if (password.length < 6) {

        return jsonError("????");

      }

      const userRows = await sql<{ id: number; password: string }[]>`

        SELECT id, password FROM "user" WHERE mail = ${username} LIMIT 1

      `;

      if (userRows.length === 0) {

        return jsonError("?????");

      }

      const authCheck = settingValue(ctx.settings, "auth_check", "0", true);

      if (authCheck === "0") {

        const cacheCode = memoryCache.get(`code${username}`);

        if (!cacheCode || String(cacheCode) !== code) {

          return jsonError("?????");

        }

      } else if (authCheck === "1") {

        if (!oldPassword || md5(oldPassword) !== toStringValue(userRows[0].password)) {

          return jsonError("?????");

        }

      }

      await sql`

        UPDATE "user"

        SET password = ${md5(password)}

        WHERE id = ${userRows[0].id}

      `;

      await sql`

        DELETE FROM token WHERE user_id = ${userRows[0].id}

      `;

      memoryCache.delete(`login.${username}`);

      return jsonSuccess("ok");

    }

case "newmail": {

      const authUser = await getUser(ctx, true);

      if (!authUser) {

        return jsonError("请登录后操作");

      }

      const mail = toStringValue(deepGet(ctx.requestData.body, "mail", "")).trim();

      const code = toStringValue(deepGet(ctx.requestData.body, "code", "")).trim();

      if (!mail || !code) {

        return jsonError("请认真填写表单");

      }

      if (!validateEmail(mail)) {

        return jsonError("邮箱格式错误");

      }

      const cacheCode = memoryCache.get(`code${mail}`);

      if (!cacheCode || String(cacheCode) !== code) {

        return jsonError("验证码错误");

      }

      const existing = await sql<{ id: number }[]>`

        SELECT id FROM "user" WHERE mail = ${mail} LIMIT 1

      `;

      if (existing.length > 0) {

        return jsonError("该邮箱已被使用！");

      }

      await sql`

        UPDATE "user"

        SET mail = ${mail}

        WHERE id = ${authUser.user_id}

      `;

      memoryCache.delete(`code${mail}`);

      return jsonSuccess("修改成功");

    }

    case "loginout": {

      const user = await getUser(ctx);

      if (user) {

        await sql`

          DELETE FROM token

          WHERE user_id = ${user.user_id}

            AND token = ${user.token}

        `;

      }

      ctx.cachedUser = null;

      return jsonSuccess("ok");

    }

    case "get": {

      const authUser = await getUser(ctx, true);

      if (!authUser) {

        return jsonError("获取失败");

      }

      const rows = await sql<

        {

          id: number;

          mail: string | null;

          manager: number;

          nickname: string | null;

          avatar: string | null;

          qq_open_id: string | null;

          wx_open_id: string | null;

          active: string | null;

        }[]

      >`

        SELECT id, mail, manager, nickname, avatar, qq_open_id, wx_open_id, active::text AS active

        FROM "user"

        WHERE id = ${authUser.user_id}

        LIMIT 1

      `;

      if (rows.length === 0) {

        return jsonError("获取失败");

      }

      const info = { ...rows[0] } as AnyObject;

      if (info.qq_open_id) {

        info.qqBind = true;

        delete info.qq_open_id;

      }

      if (info.wx_open_id) {

        info.wxBind = true;

        delete info.wx_open_id;

      }

      if (toStringValue(info.active) !== todayDateString()) {

        await sql`

          UPDATE "user"

          SET active = ${todayDateString()}

          WHERE id = ${authUser.user_id}

        `;

      }

      return jsonSuccess("ok", info);

    }

    case "unbindqq": {

      const authUser = await getUser(ctx, true);

      if (!authUser) {

        return jsonError("解绑失败");

      }

      const rows = await sql<{ mail: string | null }[]>`

        SELECT mail

        FROM "user"

        WHERE id = ${authUser.user_id}

        LIMIT 1

      `;

      if (rows.length === 0) {

        return jsonError("解绑失败");

      }

      if (!rows[0].mail) {

        return jsonError("请先绑定邮箱后再解绑");

      }

      await sql`

        UPDATE "user"

        SET qq_open_id = ''

        WHERE id = ${authUser.user_id}

      `;

      return jsonSuccess("解绑成功");

    }

    
    case "unbindwx": {

      const authUser = await getUser(ctx, true);

      if (!authUser) {

        return jsonError("????");

      }

      const rows = await sql<{ mail: string | null }[]>`

        SELECT mail

        FROM "user"

        WHERE id = ${authUser.user_id}

        LIMIT 1

      `;

      if (rows.length === 0) {

        return jsonError("????");

      }

      if (!rows[0].mail) {

        return jsonError("??????????");

      }

      await sql`

        UPDATE "user"

        SET wx_open_id = '',

            wx_unionid = ''

        WHERE id = ${authUser.user_id}

      `;

      return jsonSuccess("????");

    }

case "updateinfo": {

      const authUser = await getUser(ctx, true);

      if (!authUser) {

        return jsonError("修改失败");

      }

      const field = toStringValue(deepGet(ctx.requestData.body, "field", ""));

      const value = deepGet(ctx.requestData.body, "value", "");

      if (["nickname", "avatar"].includes(field)) {

        await sql.unsafe(

          `UPDATE "user" SET "${field}" = $1 WHERE id = $2`,

          [value, authUser.user_id]

        );

      }

      return jsonSuccess("修改成功");

    }

    case "qlogin": {

      const appId = settingValue(ctx.settings, "qq_login_appid", "");

      const callback = `https://${ctx.request.nextUrl.host}/qq_login`;

      const type = toStringValue(deepGet(ctx.requestData.query, "type", ""));

      let state = md5(randomUUID());

      if (type === "bind") {

        state = `${state}bind`;

      }

      const params = new URLSearchParams({

        redirect_uri: callback,

        state,

        response_type: "code",

        scope: "get_user_info,list_album,upload_pic",

        client_id: appId

      });

      return NextResponse.redirect(`https://graph.qq.com/oauth2.0/authorize?${params.toString()}`);

    }

    case "qq_login": {

      const code = toStringValue(deepGet(ctx.requestData.query, "code", ""));

      const state = toStringValue(deepGet(ctx.requestData.query, "state", ""));

      const bindMode = state.includes("bind");

      const appId = settingValue(ctx.settings, "qq_login_appid", "");

      const appKey = settingValue(ctx.settings, "qq_login_appkey", "");

      const callback = `https://${ctx.request.nextUrl.host}/qq_login`;

      try {

        const tokenUrl = new URL("https://graph.qq.com/oauth2.0/token");

        tokenUrl.searchParams.set("grant_type", "authorization_code");

        tokenUrl.searchParams.set("client_id", appId);

        tokenUrl.searchParams.set("client_secret", appKey);

        tokenUrl.searchParams.set("code", code);

        tokenUrl.searchParams.set("redirect_uri", callback);

        tokenUrl.searchParams.set("fmt", "json");

        const tokenResp = await fetch(tokenUrl.toString());

        if (!tokenResp.ok) {

          return renderQqLoginErrorHtml();

        }

        const tokenJson = (await tokenResp.json()) as AnyObject;

        const accessToken = toStringValue(tokenJson.access_token, "");

        if (!accessToken) {

          return renderQqLoginErrorHtml();

        }



        const openIdUrl = new URL("https://graph.qq.com/oauth2.0/me");

        openIdUrl.searchParams.set("access_token", accessToken);

        openIdUrl.searchParams.set("fmt", "json");

        const openIdResp = await fetch(openIdUrl.toString());

        if (!openIdResp.ok) {

          return renderQqLoginErrorHtml();

        }

        const openIdJson = (await openIdResp.json()) as AnyObject;

        const openId = toStringValue(openIdJson.openid, "");

        if (!openId) {

          return renderQqLoginErrorHtml();

        }



        if (bindMode) {

          const existing = await sql<{ id: number }[]>`

            SELECT id FROM "user" WHERE qq_open_id = ${openId} LIMIT 1

          `;

          if (existing.length > 0) {

            return renderQqLoginErrorHtml();

          }

          const currentUser = await getUser(ctx);

          if (currentUser) {

            await sql`

              UPDATE "user" SET qq_open_id = ${openId} WHERE id = ${currentUser.user_id}

            `;

          }

        }



        let userRows = await sql<

          {

            id: number;

            status: number;

          }[]

        >`

          SELECT id, status

          FROM "user"

          WHERE qq_open_id = ${openId}

          LIMIT 1

        `;



        if (userRows.length === 0) {

          await sql`

            INSERT INTO "user"(mail, password, create_time, register_ip, qq_open_id)

            VALUES ('', ${md5(String(Date.now()))}, ${nowDateTimeString()}, ${getRealIp(ctx.request)}, ${openId})

          `;

          userRows = await sql<{ id: number; status: number }[]>`

            SELECT id, status

            FROM "user"

            WHERE qq_open_id = ${openId}

            LIMIT 1

          `;

          try {

            const userInfoUrl = new URL("https://graph.qq.com/user/get_user_info");

            userInfoUrl.searchParams.set("openid", openId);

            userInfoUrl.searchParams.set("oauth_consumer_key", appId);

            userInfoUrl.searchParams.set("access_token", accessToken);

            const userInfoResp = await fetch(userInfoUrl.toString());

            if (userInfoResp.ok) {

              const userInfoJson = (await userInfoResp.json()) as AnyObject;

              if (parseNumber(userInfoJson.ret, -1) === 0) {

                await sql`

                  UPDATE "user"

                  SET nickname = ${toStringValue(userInfoJson.nickname, "")},

                      avatar = ${toStringValue(userInfoJson.figureurl_qq_1, "")}

                  WHERE qq_open_id = ${openId}

                `;

              }

            }

          } catch {

            // ignore

          }

        }



        if (userRows.length === 0 || userRows[0].status === 1) {

          return renderQqLoginErrorHtml();

        }



        await sql`

          UPDATE "user"

          SET login_ip = ${getRealIp(ctx.request)},

              login_time = ${nowDateTimeString()},

              login_fail_count = 0

          WHERE id = ${userRows[0].id}

        `;

        const auth = await refreshToken(

          {

            id: userRows[0].id,

            access_token: accessToken

          },

          ctx

        );

        return renderQqLoginHtml({

          user_id: parseNumber(auth.user_id, userRows[0].id),

          token: toStringValue(auth.token)

        });

      } catch {

        return renderQqLoginErrorHtml();

      }

    }

    
    case "wx_login": {

      return handleWxLogin(ctx);

    }

    case "is_wx_login": {

      const state = toStringValue(deepGet(ctx.requestData.body, "state", ""));

      const cached = getWxLoginState(state);

      if (cached && toStringValue(cached.type, "") === "wx_login") {

        const status = parseNumber(cached.status, 0);

        if (status === 1 || status === 2) {

          memoryCache.delete(wxLoginCacheKey(state));

          return jsonSuccess("ok", cached);

        }

      }

      return jsonError("wait");

    }

case "usergroup": {

      await getAdmin(ctx);

      const rows = await sql`

        SELECT id, name, create_time, sort

        FROM user_group

        ORDER BY sort DESC

      `;

      return jsonSuccess("ok", rows);

    }

    case "creategroup": {

      assertNotDemoMode();

      await getAdmin(ctx);

      const type = toStringValue(deepGet(ctx.requestData.body, "type", ""));

      if (type === "edit") {

        const form = deepGet(ctx.requestData.body, "info", {}) as AnyObject;

        const id = parseNumber(deepGet(ctx.requestData.body, "info.id", 0), 0);

        if (id > 0) {

          await sql`

            UPDATE user_group

            SET name = ${toStringValue(form.name, "")},

                create_time = ${form.create_time ? toStringValue(form.create_time) : nowDateTimeString()},

                sort = ${parseNumber(form.sort, 0)}

            WHERE id = ${id}

          `;

        } else {

          await sql`

            INSERT INTO user_group(name, create_time, sort)

            VALUES (

              ${toStringValue(form.name, "")},

              ${toStringValue(form.create_time, nowDateTimeString())},

              ${parseNumber(form.sort, 0)}

            )

          `;

        }

      } else if (type === "del") {

        const id = parseNumber(deepGet(ctx.requestData.body, "id", 0), 0);

        await sql`DELETE FROM user_group WHERE id = ${id}`;

        await sql`UPDATE "user" SET group_id = 0 WHERE group_id = ${id}`;

      }

      return jsonSuccess("处理完毕！");

    }

    case "sortgroup": {

      const sortList = toArray<AnyObject>(ctx.requestData.body);

      for (const item of sortList) {

        await sql`

          UPDATE user_group

          SET sort = ${parseNumber(item.sort, 0)}

          WHERE id = ${parseNumber(item.id, 0)}

        `;

      }

      return jsonSuccess("ok");

    }

    default:

      return jsonError("not action");

  }

}



async function handleConfigController(ctx: LegacyContext, action: string): Promise<NextResponse> {

  switch (action.toLowerCase()) {

    case "update": {

      const user = await getUser(ctx, true);

      if (!user) {

        return jsonError("保存失败");

      }

      const config = deepGet(ctx.requestData.body, "config", null);

      if (!config) {

        return jsonError("保存失败");

      }

      const existing = await sql<{ user_id: number }[]>`

        SELECT user_id

        FROM config

        WHERE user_id = ${user.user_id}

        LIMIT 1

      `;

      if (existing.length > 0) {

        await sql`

          UPDATE config

          SET config = ${JSON.stringify(config)}

          WHERE user_id = ${user.user_id}

        `;

      } else {

        await sql`

          INSERT INTO config(user_id, config)

          VALUES (${user.user_id}, ${JSON.stringify(config)})

        `;

      }

      return jsonSuccess("ok");

    }

    case "get": {

      const config = await getConfigDataForUser(ctx);

      if (Object.keys(config as AnyObject).length > 0) {

        return jsonSuccess("ok", config);

      }

      return jsonSuccess("noLogin", config);

    }

    default:

      return jsonError("not action");

  }

}



async function handleTabbarController(ctx: LegacyContext, action: string): Promise<NextResponse> {

  switch (action.toLowerCase()) {

    case "update": {

      const user = await getUser(ctx, true);

      if (!user) {

        return jsonError("保存失败");

      }

      const tabbar = deepGet(ctx.requestData.body, "tabbar", []);

      const exists = await sql<{ user_id: number }[]>`

        SELECT user_id

        FROM tabbar

        WHERE user_id = ${user.user_id}

        LIMIT 1

      `;

      if (exists.length > 0) {

        await sql`

          UPDATE tabbar

          SET tabs = ${JSON.stringify(tabbar)},

              update_time = ${nowDateTimeString()}

          WHERE user_id = ${user.user_id}

        `;

      } else {

        await sql`

          INSERT INTO tabbar(user_id, tabs, update_time)

          VALUES (${user.user_id}, ${JSON.stringify(tabbar)}, ${nowDateTimeString()})

        `;

      }

      return jsonSuccess("ok");

    }

    case "get":

      return jsonSuccess("ok", await getTabbarDataForUser(ctx));

    default:

      return jsonError("not action");

  }

}

type BrowserBookmarkNode = {
  id?: unknown;
  title?: unknown;
  name?: unknown;
  url?: unknown;
  dateAdded?: unknown;
  children?: unknown;
};

type BrowserBookmarkRecord = {
  bookmark_id: string;
  url: string;
  bookmark_title: string;
  folder_path: string;
  date_added: string;
  page_title: string;
  page_description: string;
  page_text: string;
  generated_title: string;
  generated_description: string;
  crawl_error: string;
};

let browserBookmarkTablesReady = false;

async function ensureBrowserBookmarkTables(): Promise<void> {
  if (browserBookmarkTablesReady) {
    return;
  }
  await sql`
    CREATE TABLE IF NOT EXISTS browser_bookmark_relation (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      source VARCHAR(50) NOT NULL DEFAULT 'google_chrome',
      create_time TIMESTAMP NOT NULL,
      update_time TIMESTAMP NOT NULL
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS browser_bookmark_relation_user_id_index
    ON browser_bookmark_relation (user_id)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS browser_bookmark_data (
      id BIGSERIAL PRIMARY KEY,
      relation_id BIGINT NOT NULL,
      bookmark_id VARCHAR(100) NOT NULL,
      url TEXT NOT NULL,
      bookmark_title TEXT NOT NULL,
      folder_path TEXT NOT NULL DEFAULT '',
      date_added VARCHAR(64) NOT NULL DEFAULT '',
      page_title TEXT NOT NULL DEFAULT '',
      page_description TEXT NOT NULL DEFAULT '',
      page_text TEXT NOT NULL DEFAULT '',
      generated_title TEXT NOT NULL DEFAULT '',
      generated_description TEXT NOT NULL DEFAULT '',
      crawl_error TEXT NOT NULL DEFAULT '',
      create_time TIMESTAMP NOT NULL
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS browser_bookmark_data_relation_id_index
    ON browser_bookmark_data (relation_id)
  `;
  browserBookmarkTablesReady = true;
}

function normalizeBookmarkUrl(value: unknown): string {
  const raw = toStringValue(value, "").trim();
  if (!raw) {
    return "";
  }
  try {
    const parsed = new URL(raw);
    return parsed.toString();
  } catch (_error) {
    return raw;
  }
}

function normalizeBookmarkId(rawId: unknown, fallbackIndex: number): string {
  const id = toStringValue(rawId, "").trim();
  if (id) {
    const digits = id.replace(/\D/g, "");
    if (digits) {
      return `bm-${digits.padStart(7, "0")}`;
    }
    return `bm-${id}`;
  }
  return `bm-${String(fallbackIndex).padStart(7, "0")}`;
}

function inferBookmarkTitle(rawTitle: string, url: string): string {
  if (rawTitle) {
    return rawTitle;
  }
  try {
    const parsed = new URL(url);
    return parsed.hostname || url;
  } catch (_error) {
    return url;
  }
}

function buildBrowserBookmarkRecords(sourceTree: unknown): BrowserBookmarkRecord[] {
  const roots = toArray<BrowserBookmarkNode>(sourceTree);
  const records: BrowserBookmarkRecord[] = [];
  let fallbackIndex = 1;

  const visit = (node: BrowserBookmarkNode, folderPath: string[]): void => {
    const nodeObj = (node ?? {}) as AnyObject;
    const rawTitle = toStringValue(nodeObj.title ?? nodeObj.name, "").trim();
    const nodeUrl = normalizeBookmarkUrl(nodeObj.url);
    const folderToken = rawTitle || toStringValue(nodeObj.id, "").trim();
    const nextPath = folderToken ? [...folderPath, folderToken] : folderPath;

    if (nodeUrl) {
      const bookmarkTitle = inferBookmarkTitle(rawTitle, nodeUrl);
      const pageTitle = "";
      const pageDescription = "";
      const pageText = "";
      const generatedTitle = bookmarkTitle || pageTitle;
      const generatedDescription = [pageDescription, pageText].filter(Boolean).join(" ").trim();

      records.push({
        bookmark_id: normalizeBookmarkId(nodeObj.id, fallbackIndex),
        url: nodeUrl,
        bookmark_title: bookmarkTitle,
        folder_path: folderPath.join("/"),
        date_added: toStringValue(nodeObj.dateAdded, "").trim(),
        page_title: pageTitle,
        page_description: pageDescription,
        page_text: pageText,
        generated_title: generatedTitle,
        generated_description: generatedDescription,
        crawl_error: ""
      });
      fallbackIndex += 1;
    }

    const children = toArray<BrowserBookmarkNode>(nodeObj.children);
    for (const child of children) {
      visit(child, nextPath);
    }
  };

  for (const root of roots) {
    const rootObj = (root ?? {}) as AnyObject;
    const rootTitle = toStringValue(rootObj.title ?? rootObj.name, "").trim();
    const rootUrl = normalizeBookmarkUrl(rootObj.url);
    const rootChildren = toArray<BrowserBookmarkNode>(rootObj.children);

    // Chrome root node is usually a virtual folder; skip path pollution.
    if (!rootTitle && !rootUrl && rootChildren.length > 0) {
      for (const child of rootChildren) {
        visit(child, []);
      }
      continue;
    }

    visit(root, []);
  }

  return records.filter(
    (item) => item.url.trim().length > 0 && item.bookmark_title.trim().length > 0
  );
}



async function handleLinkController(ctx: LegacyContext, action: string): Promise<NextResponse> {

  switch (action.toLowerCase()) {

    case "update": {

      const user = await getUser(ctx, true);

      if (!user) {

        return jsonError("保存失败");

      }

      const link = deepGet(ctx.requestData.body, "link", []);

      if (!Array.isArray(link)) {

        return jsonError("保存失败");

      }

      const existing = await sql<{ user_id: number; link: unknown }[]>`

        SELECT user_id, link

        FROM link

        WHERE user_id = ${user.user_id}

        LIMIT 1

      `;

      if (existing.length > 0) {

        await sql`

          INSERT INTO history(user_id, link, create_time)

          VALUES (${user.user_id}, ${JSON.stringify(existing[0].link ?? [])}, ${nowDateTimeString()})

        `;

        const historyRows = await sql<{ id: number }[]>`

          SELECT id

          FROM history

          WHERE user_id = ${user.user_id}

          ORDER BY id DESC

          LIMIT 50

        `;

        if (historyRows.length > 0) {

          const keepIds = historyRows.map((row) => row.id);

          await sql`

            DELETE FROM history

            WHERE user_id = ${user.user_id}

              AND id <> ALL(${sql.array(keepIds)})

          `;

        }

        await sql`

          UPDATE link

          SET link = ${JSON.stringify(link)},

              update_time = ${nowDateTimeString()}

          WHERE user_id = ${user.user_id}

        `;

      } else {

        await sql`

          INSERT INTO link(user_id, link, update_time)

          VALUES (${user.user_id}, ${JSON.stringify(link)}, ${nowDateTimeString()})

        `;

      }

      memoryCache.delete(`Link.${user.user_id}`);

      return jsonSuccess("ok");

    }

    case "get":

      return jsonSuccess("ok", await getLinkDataForUser(ctx));

    case "refreshwebappcache":

      await getAdmin(ctx);

      for (const key of memoryCache.keys()) {

        if (key.startsWith("Link.")) {

          memoryCache.delete(key);

        }

      }

      return jsonSuccess("刷新完毕");

    case "history": {

      const user = await getUser(ctx, true);

      if (!user) {

        return jsonError("请登录后操作");

      }

      const rows = await sql`

        SELECT id, user_id, create_time

        FROM history

        WHERE user_id = ${user.user_id}

          AND create_time IS NOT NULL

        ORDER BY id DESC

        LIMIT 100

      `;

      return jsonSuccess("ok", rows);

    }

    case "delback": {

      const user = await getUser(ctx, true);

      const id = parseNumber(deepGet(ctx.requestData.body, "id", 0), 0);

      if (!user || !id) {

        return jsonError("备份节点不存在");

      }

      const result = await sql`

        DELETE FROM history

        WHERE id = ${id}

          AND user_id = ${user.user_id}

      `;

      if (result.count > 0) {

        return jsonSuccess("ok");

      }

      return jsonError("备份节点不存在");

    }

    case "rollback": {

      const user = await getUser(ctx, true);

      const id = parseNumber(deepGet(ctx.requestData.body, "id", 0), 0);

      if (!user || !id) {

        return jsonError("备份节点不存在");

      }

      const rows = await sql<{ link: unknown }[]>`

        SELECT link

        FROM history

        WHERE id = ${id}

          AND user_id = ${user.user_id}

        LIMIT 1

      `;

      if (rows.length === 0) {

        return jsonError("备份节点不存在");

      }

      await sql`

        INSERT INTO link(user_id, link, update_time)

        VALUES (${user.user_id}, ${JSON.stringify(rows[0].link ?? [])}, ${nowDateTimeString()})

        ON CONFLICT (user_id)

        DO UPDATE SET

          link = EXCLUDED.link,

          update_time = EXCLUDED.update_time

      `;

      memoryCache.delete(`Link.${user.user_id}`);

      return jsonSuccess("ok");

    }

    case "reset": {

      const user = await getUser(ctx);

      if (user) {

        await sql`DELETE FROM link WHERE user_id = ${user.user_id}`;

        await sql`DELETE FROM tabbar WHERE user_id = ${user.user_id}`;

        await sql`DELETE FROM config WHERE user_id = ${user.user_id}`;

        await sql`DELETE FROM user_search_engine WHERE user_id = ${user.user_id}`;

        memoryCache.delete(`Link.${user.user_id}`);

      }

      return jsonSuccess("ok");

    }

    case "importbrowserbookmarks": {
      const user = await getUser(ctx, true);
      if (!user) {
        return jsonError("请登录后操作");
      }

      await ensureBrowserBookmarkTables();

      const source = toStringValue(
        deepGet(ctx.requestData.body, "source", "google_chrome"),
        "google_chrome"
      ).trim() || "google_chrome";

      const bookmarkTree = deepGet(ctx.requestData.body, "bookmarkTree", []);
      const records = buildBrowserBookmarkRecords(bookmarkTree);
      if (records.length === 0) {
        return jsonError("未采集到有效书签数据");
      }

      const now = nowDateTimeString();
      const relationRows = await sql<{ id: number }[]>`
        INSERT INTO browser_bookmark_relation(user_id, source, create_time, update_time)
        VALUES (${user.user_id}, ${source}, ${now}, ${now})
        RETURNING id
      `;
      const relationId = relationRows[0]?.id;
      if (!relationId) {
        return jsonError("书签关联关系创建失败");
      }

      for (const row of records) {
        await sql`
          INSERT INTO browser_bookmark_data(
            relation_id,
            bookmark_id,
            url,
            bookmark_title,
            folder_path,
            date_added,
            page_title,
            page_description,
            page_text,
            generated_title,
            generated_description,
            crawl_error,
            create_time
          )
          VALUES (
            ${relationId},
            ${row.bookmark_id},
            ${row.url},
            ${row.bookmark_title},
            ${row.folder_path},
            ${row.date_added},
            ${row.page_title},
            ${row.page_description},
            ${row.page_text},
            ${row.generated_title},
            ${row.generated_description},
            ${row.crawl_error},
            ${now}
          )
        `;
      }

      return jsonSuccess("ok", {
        relation_id: relationId,
        count: records.length
      });
    }

    case "getbrowserbookmarks": {
      const user = await getUser(ctx, true);
      if (!user) {
        return jsonError("请登录后操作");
      }

      await ensureBrowserBookmarkTables();

      const requestedRelationId = parseNumber(
        deepGet(ctx.requestData.body, "relation_id", 0),
        0
      );

      let relationId = requestedRelationId;
      if (relationId <= 0) {
        const latest = await sql<{ id: number }[]>`
          SELECT id
          FROM browser_bookmark_relation
          WHERE user_id = ${user.user_id}
          ORDER BY id DESC
          LIMIT 1
        `;
        relationId = latest[0]?.id ?? 0;
      } else {
        const belongs = await sql<{ id: number }[]>`
          SELECT id
          FROM browser_bookmark_relation
          WHERE id = ${relationId}
            AND user_id = ${user.user_id}
          LIMIT 1
        `;
        if (belongs.length === 0) {
          relationId = 0;
        }
      }

      if (relationId <= 0) {
        return jsonSuccess("ok", []);
      }

      const rows = await sql<BrowserBookmarkRecord[]>`
        SELECT
          bookmark_id,
          url,
          bookmark_title,
          folder_path,
          date_added,
          page_title,
          page_description,
          page_text,
          generated_title,
          generated_description,
          crawl_error
        FROM browser_bookmark_data
        WHERE relation_id = ${relationId}
        ORDER BY id ASC
      `;

      return jsonSuccess("ok", rows);
    }

    default:

      return jsonError("not action");

  }

}



async function handleSearchEngineController(

  ctx: LegacyContext,

  action: string

): Promise<NextResponse> {

  switch (action.toLowerCase()) {

    case "index": {

      const rows = await sql`

        SELECT *

        FROM search_engine

        WHERE status = 1

        ORDER BY sort DESC

      `;

      return jsonSuccess("ok", rows);

    }

    case "list": {

      await getAdmin(ctx);

      const name = toStringValue(deepGet(ctx.requestData.body, "search.name", "")).trim();

      if (name) {

        const rows = await sql`

          SELECT *

          FROM search_engine

          WHERE name ILIKE ${`%${name}%`} OR tips ILIKE ${`%${name}%`}

          ORDER BY sort DESC

        `;

        return jsonSuccess("ok", rows);

      }

      const rows = await sql`

        SELECT *

        FROM search_engine

        ORDER BY sort DESC

      `;

      return jsonSuccess("ok", rows);

    }

    case "add": {

      assertNotDemoMode();

      await getAdmin(ctx);

      const form = deepGet(ctx.requestData.body, "form", null);

      if (!form || typeof form !== "object") {

        return jsonError("缺少数据");

      }

      const data = form as AnyObject;

      const id = parseNumber(data.id, 0);

      if (id > 0) {

        await sql`

          UPDATE search_engine

          SET name = ${toStringValue(data.name, "")},

              icon = ${toStringValue(data.icon, "")},

              url = ${toStringValue(data.url, "")},

              sort = ${parseNumber(data.sort, 0)},

              create_time = ${toStringValue(data.create_time, nowDateTimeString())},

              status = ${parseNumber(data.status, 0)},

              tips = ${toStringValue(data.tips, "")}

          WHERE id = ${id}

        `;

      } else {

        await sql`

          INSERT INTO search_engine(name, icon, url, sort, create_time, status, tips)

          VALUES (

            ${toStringValue(data.name, "")},

            ${toStringValue(data.icon, "")},

            ${toStringValue(data.url, "")},

            ${parseNumber(data.sort, 0)},

            ${toStringValue(data.create_time, nowDateTimeString())},

            ${parseNumber(data.status, 0)},

            ${toStringValue(data.tips, "")}

          )

        `;

      }

      memoryCache.delete("searchEngine");

      return jsonSuccess("保存成功！");

    }

    case "del": {

      assertNotDemoMode();

      await getAdmin(ctx);

      const ids = toArray<number>(deepGet(ctx.requestData.body, "ids", []))

        .map((value) => parseNumber(value, 0))

        .filter((value) => value > 0);

      if (ids.length > 0) {

        await sql`

          DELETE FROM search_engine

          WHERE id = ANY(${sql.array(ids)})

        `;

      }

      memoryCache.delete("searchEngine");

      return jsonSuccess("删除成功");

    }

    case "searchengine": {

      const user = await getUser(ctx);

      if (user) {

        const userRows = await sql<{ list: unknown }[]>`

          SELECT list

          FROM user_search_engine

          WHERE user_id = ${user.user_id}

          LIMIT 1

        `;

        if (userRows.length > 0) {

          return jsonSuccess("ok", userRows[0].list ?? []);

        }

      }

      const cached = memoryCache.get("searchEngine");

      if (cached !== null) {

        return jsonSuccess("ok", cached);

      }

      const rows = await sql`

        SELECT *

        FROM search_engine

        WHERE status = 1

        ORDER BY sort DESC

        LIMIT 10

      `;

      memoryCache.set("searchEngine", rows, 60 * 60 * 24);

      return jsonSuccess("ok", rows);

    }

    case "savesearchengine": {

      const user = await getUser(ctx, true);

      if (!user) {

        return jsonError("保存失败");

      }

      const value = deepGet(ctx.requestData.body, "searchEngine", null);

      if (!value) {

        return jsonError("保存失败");

      }

      await sql`

        INSERT INTO user_search_engine(user_id, list)

        VALUES (${user.user_id}, ${JSON.stringify(value)})

        ON CONFLICT (user_id)

        DO UPDATE SET list = EXCLUDED.list

      `;

      return jsonSuccess("ok");

    }

    case "sort": {

      const list = toArray<AnyObject>(ctx.requestData.body);

      for (const item of list) {

        await sql`

          UPDATE search_engine

          SET sort = ${parseNumber(item.sort, 0)}

          WHERE id = ${parseNumber(item.id, 0)}

        `;

      }

      memoryCache.delete("searchEngine");

      return jsonSuccess("ok");

    }

    default:

      return jsonError("not action");

  }

}



async function handleNoteController(ctx: LegacyContext, action: string): Promise<NextResponse> {

  switch (action.toLowerCase()) {

    case "get": {

      const user = await getUser(ctx);

      const limit = parseNumber(deepGet(ctx.requestData.query, "limit", 999999), 999999);

      if (!user) {

        return jsonSuccess("", []);

      }

      const rows = await sql`

        SELECT user_id, id, title, create_time, update_time, weight, sort

        FROM note

        WHERE user_id = ${user.user_id}

        ORDER BY sort ASC, create_time DESC

        LIMIT ${limit}

      `;

      return jsonSuccess("ok", rows);

    }

    case "sort": {

      const user = await getUser(ctx, true);

      if (!user) {

        return jsonError("请登录后操作");

      }

      const ids = toArray<number>(deepGet(ctx.requestData.body, "ids", []))

        .map((id) => parseNumber(id, 0))

        .filter((id) => id > 0);

      for (let index = 0; index < ids.length; index += 1) {

        await sql`

          UPDATE note

          SET sort = ${index}

          WHERE id = ${ids[index]}

            AND user_id = ${user.user_id}

        `;

      }

      return jsonSuccess("ok");

    }

    case "gettext": {

      const user = await getUser(ctx, true);

      const id = parseNumber(deepGet(ctx.requestData.query, "id", 0), 0);

      const rows = await sql<{ text: string | null }[]>`

        SELECT text

        FROM note

        WHERE user_id = ${user?.user_id ?? 0}

          AND id = ${id}

        LIMIT 1

      `;

      const text = addRootUrlToImages(toStringValue(rows[0]?.text, ""), rootUrl(ctx.request));

      return buildFileResponse(text, "text/html; charset=utf-8");

    }

    case "setweight": {

      const user = await getUser(ctx, true);

      const id = parseNumber(deepGet(ctx.requestData.body, "id", 0), 0);

      const weight = parseNumber(deepGet(ctx.requestData.body, "weight", 0), 0);

      if (id > 0 && user) {

        await sql`

          UPDATE note

          SET weight = ${weight},

              update_time = ${nowDateTimeString()}

          WHERE id = ${id}

            AND user_id = ${user.user_id}

        `;

      }

      return jsonSuccess("ok");

    }

    case "del": {

      const user = await getUser(ctx, true);

      const id = parseNumber(deepGet(ctx.requestData.query, "id", 0), 0);

      const result = await sql`

        DELETE FROM note

        WHERE user_id = ${user?.user_id ?? 0}

          AND id = ${id}

      `;

      return jsonSuccess("删除成功", result.count);

    }

    case "add": {

      const user = await getUser(ctx, true);

      const id = parseNumber(deepGet(ctx.requestData.body, "id", 0), 0);

      if (id > 0) {

        return handleNoteController(ctx, "update");

      }

      const title = toStringValue(deepGet(ctx.requestData.body, "title", ""));

      const textRaw = toStringValue(deepGet(ctx.requestData.body, "text", ""));

      const text = removeRootUrlFromImages(textRaw, rootUrl(ctx.request));

      const weight = parseNumber(deepGet(ctx.requestData.body, "weight", 0), 0);

      const insertRows = await sql<{ id: number }[]>`

        INSERT INTO note(user_id, title, text, weight, create_time, update_time)

        VALUES (

          ${user?.user_id ?? 0},

          ${title},

          ${text},

          ${weight},

          ${nowDateTimeString()},

          ${nowDateTimeString()}

        )

        RETURNING id

      `;

      return jsonSuccess("创建成功", {

        id: insertRows[0]?.id ?? 0,

        user_id: user?.user_id ?? 0,

        title,

        text: textRaw,

        weight

      });

    }

    case "update": {

      const user = await getUser(ctx, true);

      const id = parseNumber(deepGet(ctx.requestData.body, "id", 0), 0);

      if (id <= 0 || !user) {

        return jsonError("no");

      }

      const title = toStringValue(deepGet(ctx.requestData.body, "title", ""));

      const textRaw = toStringValue(deepGet(ctx.requestData.body, "text", ""));

      const text = removeRootUrlFromImages(textRaw, rootUrl(ctx.request));

      const weight = parseNumber(deepGet(ctx.requestData.body, "weight", 0), 0);

      const result = await sql`

        UPDATE note

        SET title = ${title},

            text = ${text},

            weight = ${weight},

            update_time = ${nowDateTimeString()}

        WHERE id = ${id}

          AND user_id = ${user.user_id}

      `;

      if (result.count > 0) {

        return jsonSuccess("修改", { id, title, text: textRaw, weight });

      }

      return jsonError("失败");

    }

    default:

      return jsonError("not action");

  }

}



async function handleCardController(ctx: LegacyContext, action: string): Promise<NextResponse> {

  switch (action.toLowerCase()) {

    case "index": {

      await syncLocalPluginCards(true);

      const rows = await sql`

        SELECT *

        FROM card

        WHERE status = 1

      `;

      return jsonSuccess("ok", rows);

    }

    case "install_num": {

      const id = parseNumber(deepGet(ctx.requestData.body, "id", 0), 0);

      if (id > 0) {

        await sql`

          UPDATE card

          SET install_num = COALESCE(install_num, 0) + 1

          WHERE id = ${id}

        `;

      }

      return jsonSuccess("ok");

    }

    default:

      return jsonError("not action");

  }

}



async function handleLinkStoreController(ctx: LegacyContext, action: string): Promise<NextResponse> {

  switch (action.toLowerCase()) {

    case "list": {

      const user = await getUser(ctx);

      const limit = parseNumber(deepGet(ctx.requestData.body, "limit", 12), 12);

      const page = parseNumber(

        deepGet(ctx.requestData.body, "page", deepGet(ctx.requestData.query, "page", 1)),

        1

      );

      const name = toStringValue(deepGet(ctx.requestData.body, "name", "")).trim();

      const area = toStringValue(deepGet(ctx.requestData.body, "area", "")).trim();



      let rows = (await sql<

        {

          id: number;

          name: string | null;

          src: string | null;

          url: string | null;

          type: string | null;

          size: string | null;

          create_time: string | null;

          hot: number;

          area: string | null;

          tips: string | null;

          domain: string | null;

          app: number;

          install_num: number;

          bgColor: string | null;

          vip: number;

          custom: unknown;

          user_id: number | null;

          status: number;

          group_ids: string | null;

        }[]

      >`

        SELECT *

        FROM linkstore

        WHERE status = 1

      `) as any[];



      if (name) {

        const keyword = name.toLowerCase();

        rows = rows.filter((row) => {

          const haystack = [

            row.name ?? "",

            row.tips ?? "",

            row.url ?? ""

          ]

            .join(" ")

            .toLowerCase();

          return haystack.includes(keyword);

        });

      }

      if (area && area !== "0") {

        rows = rows.filter((row) => containsCsvValue(row.area, area));

      }

      rows = rows.filter((row) => {

        if (containsCsvValue(row.group_ids, "0")) {

          return true;

        }

        if (user) {

          return containsCsvValue(row.group_ids, user.group_id);

        }

        return false;

      });

      rows.sort((a, b) => {

        if ((b.hot ?? 0) !== (a.hot ?? 0)) {

          return (b.hot ?? 0) - (a.hot ?? 0);

        }

        return String(b.create_time ?? "").localeCompare(String(a.create_time ?? ""));

      });

      const mapped = rows.map((row) => ({

        ...row,

        custom: row.custom ?? {},

        group_ids: csvToNumberArray(row.group_ids)

      }));

      return jsonSuccess("ok", paginateArray(mapped, page, limit));

    }

    case "listmanager": {

      await getAdmin(ctx);

      const limit = parseNumber(deepGet(ctx.requestData.body, "limit", 15), 15);

      const page = parseNumber(

        deepGet(ctx.requestData.body, "page", deepGet(ctx.requestData.query, "page", 1)),

        1

      );

      const name = toStringValue(deepGet(ctx.requestData.body, "search.name", "")).trim();

      const area = toStringValue(deepGet(ctx.requestData.body, "search.area", "")).trim();

      const groupId = toStringValue(deepGet(ctx.requestData.body, "search.group_id", "")).trim();

      const orderProp = sanitizeOrderColumn(

        toStringValue(deepGet(ctx.requestData.body, "sort.prop", "id")),

        ["id", "name", "hot", "create_time", "install_num", "status"],

        "id"

      );

      const orderType = pickSortOrder(toStringValue(deepGet(ctx.requestData.body, "sort.order", "asc")));



      const rows = await sql<

        {

          id: number;

          name: string | null;

          src: string | null;

          url: string | null;

          type: string | null;

          size: string | null;

          create_time: string | null;

          hot: number;

          area: string | null;

          tips: string | null;

          domain: string | null;

          app: number;

          install_num: number;

          bgColor: string | null;

          vip: number;

          custom: unknown;

          user_id: number | null;

          status: number;

          group_ids: string | null;

          user_nickname: string | null;

        }[]

      >`

        SELECT l.*,

               u.nickname AS user_nickname

        FROM linkstore l

        LEFT JOIN "user" u ON u.id = l.user_id

      `;

      let filtered = [...rows] as any[];

      if (name) {

        filtered = filtered.filter((row) =>

          `${row.name ?? ""} ${row.tips ?? ""}`.toLowerCase().includes(name.toLowerCase())

        );

      }

      if (area && area !== "全部") {

        filtered = filtered.filter((row) => containsCsvValue(row.area, area));

      }

      if (groupId) {

        filtered = filtered.filter((row) => containsCsvValue(row.group_ids, groupId));

      }

      filtered.sort((a, b) => {

        const av = (a as AnyObject)[orderProp];

        const bv = (b as AnyObject)[orderProp];

        if (av === bv) {

          return 0;

        }

        if (orderType === "asc") {

          return String(av ?? "").localeCompare(String(bv ?? ""));

        }

        return String(bv ?? "").localeCompare(String(av ?? ""));

      });

      const data = paginateArray(

        filtered.map((row) => ({

          ...row,

          custom: row.custom ?? {},

          group_ids: csvToNumberArray(row.group_ids),

          userInfo: row.user_id

            ? {

                id: row.user_id,

                nickname: row.user_nickname ?? ""

              }

            : null

        })),

        page,

        limit

      );

      return NextResponse.json({ msg: "ok", data, auth: ctx.auth });

    }

    case "getfolder": {

      const user = await getUser(ctx);

      let rows = (await sql<{ id: number; name: string; sort: number; group_ids: string | null }[]>`

        SELECT id, name, sort, group_ids

        FROM link_folder

      `) as any[];

      rows = rows.filter((row) => {

        if (containsCsvValue(row.group_ids, "0")) {

          return true;

        }

        if (user && parseNumber(user.group_id, 0) !== 0) {

          return containsCsvValue(row.group_ids, user.group_id);

        }

        return false;

      });

      rows.sort((a, b) => b.sort - a.sort);

      return jsonSuccess(

        "ok",

        rows.map((item) => ({ ...item, group_ids: csvToNumberArray(item.group_ids) }))

      );

    }

    case "getfolderadmin": {

      await getAdmin(ctx);

      const rows = await sql`

        SELECT id, name, sort, group_ids

        FROM link_folder

        ORDER BY sort DESC

      `;

      return jsonSuccess(

        "ok",

        (rows as AnyObject[]).map((item) => ({

          ...item,

          group_ids: csvToNumberArray(toStringValue(item.group_ids, "0"))

        }))

      );

    }

    case "add": {

      await getAdmin(ctx);

      assertNotDemoMode();

      const form = deepGet(ctx.requestData.body, "form", null);

      if (!form || typeof form !== "object") {

        return jsonError("缺少数据");

      }

      const data = { ...(form as AnyObject) };

      delete data.userInfo;

      const id = parseNumber(data.id, 0);

      if (id > 0) {

        await sql`

          UPDATE linkstore

          SET name = ${toStringValue(data.name, "")},

              src = ${toStringValue(data.src, "")},

              url = ${toStringValue(data.url, "")},

              type = ${toStringValue(data.type, "icon")},

              size = ${toStringValue(data.size, "1x1")},

              create_time = ${toStringValue(data.create_time, nowDateTimeString())},

              hot = ${parseNumber(data.hot, 0)},

              area = ${toStringValue(data.area, "")},

              tips = ${toStringValue(data.tips, "")},

              domain = ${toStringValue(data.domain, "")},

              app = ${parseNumber(data.app, 0)},

              install_num = ${parseNumber(data.install_num, 0)},

              "bgColor" = ${toStringValue(data.bgColor, "")},

              vip = ${parseNumber(data.vip, 0)},

              custom = ${JSON.stringify(data.custom ?? {})},

              user_id = ${data.user_id ? parseNumber(data.user_id, 0) : null},

              status = ${parseNumber(data.status, 1)},

              group_ids = ${numberArrayToCsv(data.group_ids)}

          WHERE id = ${id}

        `;

        const rows = await sql`SELECT * FROM linkstore WHERE id = ${id} LIMIT 1`;

        return jsonSuccess("修改成功", rows[0] ?? {});

      }

      await sql`

        INSERT INTO linkstore(

          name, src, url, type, size, create_time, hot, area, tips, domain, app,

          install_num, "bgColor", vip, custom, user_id, status, group_ids

        )

        VALUES (

          ${toStringValue(data.name, "")},

          ${toStringValue(data.src, "")},

          ${toStringValue(data.url, "")},

          ${toStringValue(data.type, "icon")},

          ${toStringValue(data.size, "1x1")},

          ${nowDateTimeString()},

          ${parseNumber(data.hot, 0)},

          ${toStringValue(data.area, "")},

          ${toStringValue(data.tips, "")},

          ${toStringValue(data.domain, "")},

          ${parseNumber(data.app, 0)},

          ${parseNumber(data.install_num, 0)},

          ${toStringValue(data.bgColor, "")},

          ${parseNumber(data.vip, 0)},

          ${JSON.stringify(data.custom ?? {})},

          ${data.user_id ? parseNumber(data.user_id, 0) : null},

          ${parseNumber(data.status, 1)},

          ${numberArrayToCsv(data.group_ids)}

        )

      `;

      const inserted = await sql`SELECT * FROM linkstore ORDER BY id DESC LIMIT 1`;

      return jsonSuccess("添加成功", inserted[0] ?? {});

    }

    case "addpublic": {

      const admin = await getAdmin(ctx);

      const form = ctx.requestData.body as AnyObject;

      const sourceSrc = toStringValue(form.src, "");

      let localSrc = sourceSrc;

      try {

        const ext = path.extname(sourceSrc).replace(".", "") || "png";

        const target = await downloadFileFromUrl(ctx, sourceSrc, `${md5(sourceSrc)}.${ext}`);

        if (target) {

          localSrc = target;

          await addFileRecord(localSrc, admin.id);

        }

      } catch {

        // keep original src

      }

      const url = toStringValue(form.url, "");

      let domain = "";

      try {

        domain = new URL(addHttpProtocol(url)).host;

      } catch {

        domain = url;

      }

      await sql`

        INSERT INTO linkstore(name, src, url, domain, create_time, tips, app, status, group_ids)

        VALUES (

          ${toStringValue(form.name, "")},

          ${localSrc},

          ${url},

          ${domain},

          ${nowDateTimeString()},

          ${toStringValue(form.tips, "")},

          ${parseNumber(form.app, 0)},

          1,

          '0'

        )

      `;

      return jsonSuccess("添加成功", {

        ...form,

        src: localSrc,

        domain

      });

    }

    case "push": {

      const user = await getUser(ctx, true);

      if (!user) {

        return jsonError("推送失败");

      }

      const form = ctx.requestData.body as AnyObject;

      const url = toStringValue(form.url, "");

      if (url.length <= 2) {

        return jsonError("推送失败");

      }

      let domain = "";

      try {

        domain = new URL(addHttpProtocol(url)).host;

      } catch {

        domain = url;

      }

      const existing = await sql<{ id: number }[]>`

        SELECT id

        FROM linkstore

        WHERE url = ${url}

        LIMIT 1

      `;

      if (existing.length === 0) {

        await sql`

          INSERT INTO linkstore(

            name, src, url, "bgColor", app, tips, domain, user_id, status, create_time, group_ids

          )

          VALUES (

            ${toStringValue(form.name, "")},

            ${toStringValue(form.src, "")},

            ${url},

            ${toStringValue(form.bgColor, "")},

            ${parseNumber(form.app, 0)},

            ${toStringValue(form.tips, "")},

            ${domain},

            ${user.user_id},

            0,

            ${nowDateTimeString()},

            '0'

          )

        `;

      }

      return jsonSuccess("推送完毕");

    }

    case "geticon": {

      const rawUrl = toStringValue(deepGet(ctx.requestData.body, "url", ""));

      if (!rawUrl) {

        return jsonError("no", "未查询到相关信息");

      }

      let lookup = rawUrl;

      if (!lookup.startsWith("tab:")) {

        lookup = addHttpProtocol(lookup);

        try {

          lookup = new URL(lookup).host;

        } catch {

          // keep lookup

        }

      }

      const rows = await sql`

        SELECT *

        FROM linkstore

        WHERE domain IS NOT NULL

      `;

      const match = (rows as AnyObject[]).find((row) =>

        containsCsvValue(toStringValue(row.domain, ""), lookup)

      );

      if (match) {

        return jsonSuccess("ok", match);

      }

      return jsonError("no", "未查询到相关信息");

    }

    case "install_num": {

      const id = parseNumber(deepGet(ctx.requestData.body, "id", 0), 0);

      if (id > 0) {

        await sql`

          UPDATE linkstore

          SET install_num = COALESCE(install_num, 0) + 1

          WHERE id = ${id}

        `;

        return jsonSuccess("ok");

      }

      return jsonError("fail");

    }

    case "createfolder": {

      await getAdmin(ctx);

      assertNotDemoMode();

      const type = toStringValue(deepGet(ctx.requestData.body, "type", ""));

      if (type === "edit") {

        const info = deepGet(ctx.requestData.body, "info", {}) as AnyObject;

        const id = parseNumber(deepGet(ctx.requestData.body, "info.id", 0), 0);

        if (id > 0) {

          await sql`

            UPDATE link_folder

            SET name = ${toStringValue(info.name, "")},

                sort = ${parseNumber(info.sort, 0)},

                group_ids = ${numberArrayToCsv(info.group_ids)}

            WHERE id = ${id}

          `;

        } else {

          await sql`

            INSERT INTO link_folder(name, sort, group_ids)

            VALUES (

              ${toStringValue(info.name, "")},

              ${parseNumber(info.sort, 0)},

              ${numberArrayToCsv(info.group_ids)}

            )

          `;

        }

      } else if (type === "del") {

        const id = parseNumber(deepGet(ctx.requestData.body, "id", 0), 0);

        await sql`DELETE FROM link_folder WHERE id = ${id}`;

        const allRows = await sql<{ id: number; area: string | null }[]>`

          SELECT id, area

          FROM linkstore

          WHERE area IS NOT NULL

        `;

        for (const row of allRows) {

          const values = (row.area ?? "")

            .split(",")

            .map((item) => item.trim())

            .filter((item) => item.length > 0 && item !== String(id));

          await sql`

            UPDATE linkstore

            SET area = ${values.join(",")}

            WHERE id = ${row.id}

          `;

        }

      }

      return jsonSuccess("处理完毕！");

    }

    case "movegroup": {

      await getAdmin(ctx);

      assertNotDemoMode();

      const ids = toArray<number>(deepGet(ctx.requestData.body, "link", []))

        .map((id) => parseNumber(id, 0))

        .filter((id) => id > 0);

      const groupIds = numberArrayToCsv(deepGet(ctx.requestData.body, "group_ids", ""));

      if (ids.length > 0) {

        await sql`

          UPDATE linkstore

          SET group_ids = ${groupIds}

          WHERE id = ANY(${sql.array(ids)})

        `;

      }

      return jsonSuccess("处理完毕！");

    }

    case "movefolder": {

      await getAdmin(ctx);

      assertNotDemoMode();

      const ids = toArray<number>(deepGet(ctx.requestData.body, "link", []))

        .map((id) => parseNumber(id, 0))

        .filter((id) => id > 0);

      const area = toStringValue(deepGet(ctx.requestData.body, "area", ""));

      if (ids.length > 0) {

        await sql`

          UPDATE linkstore

          SET area = ${area}

          WHERE id = ANY(${sql.array(ids)})

        `;

      }

      return jsonSuccess("处理完毕！");

    }

    case "sortfolder": {

      const items = toArray<AnyObject>(ctx.requestData.body);

      for (const item of items) {

        await sql`

          UPDATE link_folder

          SET sort = ${parseNumber(item.sort, 0)}

          WHERE id = ${parseNumber(item.id, 0)}

        `;

      }

      return jsonSuccess("ok");

    }

    case "del": {

      await getAdmin(ctx);

      assertNotDemoMode();

      const ids = toArray<number>(deepGet(ctx.requestData.body, "ids", []))

        .map((id) => parseNumber(id, 0))

        .filter((id) => id > 0);

      if (ids.length > 0) {

        await sql`

          DELETE FROM linkstore

          WHERE id = ANY(${sql.array(ids)})

        `;

      }

      return jsonSuccess("删除成功");

    }

    case "domains": {

      const domains = toArray<string>(deepGet(ctx.requestData.body, "domains", []))

        .map((d) => d.trim())

        .filter(Boolean);

      const rows = await sql<

        {

          name: string | null;

          src: string | null;

          url: string | null;

          bgColor: string | null;

          tips: string | null;

          domain: string | null;

          status: number;

        }[]

      >`

        SELECT name, src, url, "bgColor", tips, domain, status

        FROM linkstore

        WHERE status = 1

      `;

      const result: Record<string, AnyObject> = {};

      for (const row of rows) {

        const urlDomain = (() => {

          try {

            return new URL(addHttpProtocol(toStringValue(row.url, ""))).host;

          } catch {

            return toStringValue(row.url, "");

          }

        })();

        if (domains.includes(urlDomain)) {

          result[urlDomain] = {

            domain: urlDomain,

            name: row.name ?? "",

            src: row.src ?? "",

            bgColor: row.bgColor ?? "",

            tips: row.tips ?? ""

          };

          continue;

        }

        const candidates = toStringValue(row.domain, "")

          .split(",")

          .map((item) => item.trim())

          .filter(Boolean);

        const hit = candidates.find((candidate) => domains.includes(candidate));

        if (hit) {

          result[hit] = {

            domain: hit,

            name: row.name ?? "",

            src: row.src ?? "",

            bgColor: row.bgColor ?? "",

            tips: row.tips ?? ""

          };

        }

      }

      return jsonSuccess("ok", result);

    }

    default:

      return jsonError("not action");

  }

}



async function handleFileController(ctx: LegacyContext, action: string): Promise<NextResponse> {

  switch (action.toLowerCase()) {

    case "list": {

      await getAdmin(ctx);

      const limit = parseNumber(deepGet(ctx.requestData.body, "limit", 15), 15);

      const page = parseNumber(

        deepGet(ctx.requestData.body, "page", deepGet(ctx.requestData.query, "page", 1)),

        1

      );

      const searchPath = toStringValue(deepGet(ctx.requestData.body, "search.path", "")).trim();

      const userId = parseNumber(deepGet(ctx.requestData.body, "search.user_id", 0), 0);

      let rows = (await sql<

        {

          id: number;

          path: string | null;

          user_id: number | null;

          create_time: string | null;

          size: number | null;

          mime_type: string | null;

          hash: string | null;

          user_nickname: string | null;

          user_mail: string | null;

        }[]

      >`

        SELECT f.*,

               u.nickname AS user_nickname,

               u.mail AS user_mail

        FROM file f

        LEFT JOIN "user" u ON u.id = f.user_id

      `) as any[];

      if (searchPath) {

        const keyword = searchPath.toLowerCase();

        rows = rows.filter((row) =>

          `${row.mime_type ?? ""} ${row.path ?? ""}`.toLowerCase().includes(keyword)

        );

      }

      if (userId > 0) {

        rows = rows.filter((row) => parseNumber(row.user_id, 0) === userId);

      }

      rows.sort((a, b) => b.id - a.id);

      const paged = paginateArray(

        rows.map((row) => ({

          ...row,

          user: row.user_id

            ? {

                id: row.user_id,

                nickname: row.user_nickname ?? "",

                mail: row.user_mail ?? ""

              }

            : null

        })),

        page,

        limit

      );

      return jsonSuccess("ok", paged);

    }

    case "del": {

      await getAdmin(ctx);

      assertNotDemoMode();

      const ids = toArray<number>(deepGet(ctx.requestData.body, "ids", []))

        .map((id) => parseNumber(id, 0))

        .filter((id) => id > 0);

      if (ids.length === 0) {

        return jsonSuccess("删除成功");

      }

      const rows = await sql<{ id: number; path: string | null }[]>`

        SELECT id, path

        FROM file

        WHERE id = ANY(${sql.array(ids)})

      `;

      for (const row of rows) {

        if (row.path) {

          const absPath = toPublicAbsPath(row.path);

          if (await fileExists(absPath)) {

            await unlink(absPath).catch(() => undefined);

          }

        }

        await sql`DELETE FROM file WHERE id = ${row.id}`;

      }

      return jsonSuccess("删除成功");

    }

    case "scanlocal": {

      await getAdmin(ctx);

      assertNotDemoMode();

      const imageRoot = toPublicAbsPath("images");

      if (!(await fileExists(imageRoot))) {

        return jsonSuccess("扫描完成");

      }

      const discovered: string[] = [];

      const walk = async (dir: string): Promise<void> => {

        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {

          const full = path.join(dir, entry.name);

          if (entry.isDirectory()) {

            await walk(full);

          } else {

            const relative = normalizePath(path.relative(PUBLIC_DIR, full));

            discovered.push(joinPath("/", relative));

          }

        }

      };

      await walk(imageRoot);

      const existingRows = await sql<{ path: string | null }[]>`

        SELECT path

        FROM file

        LIMIT 5000

      `;

      const existingSet = new Set(

        existingRows.map((row) => joinPath("/", toStringValue(row.path, "")))

      );

      for (const webPath of discovered) {

        if (existingSet.has(webPath)) {

          continue;

        }

        const absPath = toPublicAbsPath(webPath);

        const st = await stat(absPath);

        const hash = await hashFile(absPath);

        const mimeType = mime.lookup(absPath) || "application/octet-stream";

        await sql`

          INSERT INTO file(path, user_id, create_time, size, hash, mime_type)

          VALUES (

            ${webPath},

            ${null},

            ${nowDateTimeString()},

            ${st.size},

            ${hash},

            ${String(mimeType)}

          )

        `;

      }

      return jsonSuccess("扫描完成");

    }

    default:

      return jsonError("not action");

  }

}



async function handleWallpaperController(ctx: LegacyContext, action: string): Promise<NextResponse> {

  switch (action.toLowerCase()) {

    case "editfolder": {

      await getAdmin(ctx);

      assertNotDemoMode();

      const form = ctx.requestData.body as AnyObject;

      const id = parseNumber(form.id, 0);

      if (id > 0) {

        await sql`

          UPDATE wallpaper

          SET name = ${toStringValue(form.name, "")},

              type = 1

          WHERE id = ${id}

        `;

      } else {

        await sql`

          INSERT INTO wallpaper(name, type, create_time, sort)

          VALUES (${toStringValue(form.name, "")}, 1, ${nowDateTimeString()}, 999)

        `;

      }

      const rows = await sql`

        SELECT id, name, type, sort, create_time

        FROM wallpaper

        WHERE type = 1

        ORDER BY sort

      `;

      return jsonSuccess("处理完毕", rows);

    }

    case "delfolder": {

      await getAdmin(ctx);

      const id = parseNumber(deepGet(ctx.requestData.body, "id", 0), 0);

      const folderRows = await sql<{ id: number }[]>`

        SELECT id FROM wallpaper WHERE id = ${id} LIMIT 1

      `;

      if (folderRows.length === 0) {

        return jsonError("分类不存在！");

      }

      await sql`DELETE FROM wallpaper WHERE id = ${id}`;

      const items = await sql<{ id: number; url: string | null; cover: string | null }[]>`

        SELECT id, url, cover

        FROM wallpaper

        WHERE type = 0

          AND folder = ${id}

      `;

      for (const item of items) {

        if (item.url) {

          await unlink(toPublicAbsPath(item.url)).catch(() => undefined);

        }

        if (item.cover) {

          await unlink(toPublicAbsPath(item.cover)).catch(() => undefined);

        }

      }

      await sql`

        DELETE FROM wallpaper

        WHERE type = 0

          AND folder = ${id}

      `;

      const folders = await sql`

        SELECT id, name, type, sort, create_time

        FROM wallpaper

        WHERE type = 1

        ORDER BY sort

      `;

      return jsonSuccess("ok", folders);

    }

    case "getfolder": {

      await getAdmin(ctx);

      const rows = await sql`

        SELECT id, name, type, sort, create_time

        FROM wallpaper

        WHERE type = 1

        ORDER BY sort

      `;

      return jsonSuccess("ok", rows);

    }

    case "getfolderclient": {

      const rows = await sql`

        SELECT id, name, type, sort, create_time

        FROM wallpaper

        WHERE type = 1

        ORDER BY sort

      `;

      return jsonSuccess("ok", rows);

    }

    case "getfolderwallpaper": {

      await getAdmin(ctx);

      const folderId = parseNumber(deepGet(ctx.requestData.body, "id", 0), 0);

      const limit = parseNumber(deepGet(ctx.requestData.body, "limit", 19), 19);

      const page = parseNumber(

        deepGet(ctx.requestData.body, "page", deepGet(ctx.requestData.query, "page", 1)),

        1

      );

      const rows = await sql`

        SELECT *

        FROM wallpaper

        WHERE type = 0

          AND folder = ${folderId}

        ORDER BY create_time DESC

      `;

      return jsonSuccess("ok", paginateArray(rows as AnyObject[], page, limit));

    }

    case "getfolderwallpaperclient": {

      const folderId = parseNumber(deepGet(ctx.requestData.body, "id", 0), 0);

      const offset = parseNumber(deepGet(ctx.requestData.body, "offset", 0), 0);

      const rows = await sql`

        SELECT create_time, id, folder, cover, type, mime, url

        FROM wallpaper

        WHERE type = 0

          AND folder = ${folderId}

        ORDER BY id DESC

        LIMIT 20

        OFFSET ${offset * 20}

      `;

      return jsonSuccess("ok", rows);

    }

    case "deletewallpaper": {

      await getAdmin(ctx);

      const id = parseNumber(deepGet(ctx.requestData.body, "id", 0), 0);

      const rows = await sql<{ url: string | null; cover: string | null }[]>`

        SELECT url, cover

        FROM wallpaper

        WHERE id = ${id}

        LIMIT 1

      `;

      if (rows.length > 0) {

        await sql`DELETE FROM wallpaper WHERE id = ${id}`;

        if (rows[0].url) {

          await unlink(toPublicAbsPath(rows[0].url)).catch(() => undefined);

        }

        if (rows[0].cover) {

          await unlink(toPublicAbsPath(rows[0].cover)).catch(() => undefined);

        }

      }

      return jsonSuccess("ok");

    }

    case "addwallpaper": {

      await getAdmin(ctx);

      const id = parseNumber(deepGet(ctx.requestData.body, "id", 0), 0);

      const data = {

        cover: toStringValue(deepGet(ctx.requestData.body, "cover", "")),

        url: toStringValue(deepGet(ctx.requestData.body, "url", "")),

        type: parseNumber(deepGet(ctx.requestData.body, "type", 0), 0),

        mime: parseNumber(deepGet(ctx.requestData.body, "mime", 0), 0),

        folder: parseNumber(deepGet(ctx.requestData.body, "folder", 0), 0)

      };

      if (id > 0) {

        await sql`

          UPDATE wallpaper

          SET cover = ${data.cover},

              url = ${data.url},

              type = ${data.type},

              mime = ${data.mime},

              folder = ${data.folder}

          WHERE id = ${id}

        `;

      } else {

        await sql`

          INSERT INTO wallpaper(cover, url, type, mime, folder, create_time, sort)

          VALUES (${data.cover}, ${data.url}, ${data.type}, ${data.mime}, ${data.folder}, ${nowDateTimeString()}, 999)

        `;

      }

      const row = id

        ? (await sql`SELECT * FROM wallpaper WHERE id = ${id} LIMIT 1`)[0]

        : (await sql`SELECT * FROM wallpaper ORDER BY id DESC LIMIT 1`)[0];

      return jsonSuccess("ok", row ?? {});

    }

    case "randomwallpaper": {

      const rows = await sql`

        SELECT id, mime, url

        FROM wallpaper

        WHERE type = 0

        ORDER BY random()

        LIMIT 1

      `;

      return jsonSuccess("ok", rows[0] ?? null);

    }

    case "sortfolder": {

      await getAdmin(ctx);

      const list = toArray<AnyObject>(ctx.requestData.body);

      for (const item of list) {

        await sql`

          UPDATE wallpaper

          SET sort = ${parseNumber(item.sort, 0)}

          WHERE id = ${parseNumber(item.id, 0)}

        `;

      }

      return jsonSuccess("ok");

    }

    default:

      return jsonError("not action");

  }

}



async function handleSettingController(ctx: LegacyContext, action: string): Promise<NextResponse> {

  switch (action.toLowerCase()) {

    case "savesetting": {

      await getAdmin(ctx);

      assertNotDemoMode();

      const form = deepGet(ctx.requestData.body, "form", {}) as AnyObject;

      for (const [key, value] of Object.entries(form)) {

        await sql`

          INSERT INTO setting(keys, value)

          VALUES (${key}, ${toStringValue(value, "")})

          ON CONFLICT (keys)

          DO UPDATE SET value = EXCLUDED.value

        `;

      }

      ctx.settings = await refreshSettingsMap();

      return jsonSuccess("保存成功");

    }

    case "refreshcache":

      await getAdmin(ctx);

      ctx.settings = await refreshSettingsMap();

      return jsonSuccess("刷新成功");

    case "delruntime": {

      await getAdmin(ctx);

      try {

        await rm(path.join(ROOT_DIR, "runtime"), {

          recursive: true,

          force: true

        });

        return jsonSuccess("删除成功");

      } catch (error) {

        return jsonError(error instanceof Error ? error.message : "删除失败");

      }

    }

    case "getsetting": {

      await getAdmin(ctx);

      const role = toArray<string>(deepGet(ctx.requestData.body, "role", []));

      const info = ctx.settings;

      const result: Record<string, string> = {};

      if (role.length > 0) {

        for (const key of role) {

          if (key in info) {

            result[key] = info[key];

          }

        }

      }

      let url = "";

      if (role.includes("ext_name")) {

        if (await fileExists(toPublicAbsPath("browserExt.zip"))) {

          url = "/browserExt.zip";

        }

      }

      if (Object.keys(info).length > 0) {

        return NextResponse.json({

          msg: "ok",

          data: result,

          success: ctx.auth,

          code: 1,

          url

        });

      }

      return NextResponse.json({

        msg: "ok",

        data: false,

        success: ctx.auth,

        code: 0,

        url

      });

    }

    case "mailtest": {

      await getAdmin(ctx);

      const email = toStringValue(deepGet(ctx.requestData.body, "email", ""));

      const smtp = deepGet(ctx.requestData.body, "smtp", {}) as AnyObject;

      try {

        await sendMailByConfig(email, "这是一封测试邮件", smtp);

        return jsonSuccess("发送成功");

      } catch (error) {

        return jsonError(error instanceof Error ? error.message : "发送失败");

      }

    }

    case "delext": {

      await getAdmin(ctx);

      await unlink(toPublicAbsPath("browserExt.zip")).catch(() => undefined);

      return jsonSuccess("ok");

    }

    default:

      return jsonError("not action");

  }

}



function renderDateSeries(

  rows: { time: string; total: number }[],

  startDate: string,

  endDate: string

): { time: string[]; total: number[]; sum: number } {

  const map = new Map(rows.map((item) => [item.time, parseNumber(item.total, 0)]));

  const dates: string[] = [];

  const totals: number[] = [];

  const start = new Date(`${startDate}T00:00:00Z`);

  const end = new Date(`${endDate}T00:00:00Z`);

  for (let date = start; date <= end; date = new Date(date.getTime() + 86400000)) {

    const key = date.toISOString().slice(0, 10);

    dates.push(key);

    totals.push(map.get(key) ?? 0);

  }

  return {

    time: dates,

    total: totals,

    sum: totals.reduce((sum, value) => sum + value, 0)

  };

}



async function handleAdminController(ctx: LegacyContext, action: string): Promise<NextResponse> {

  switch (action.toLowerCase()) {

    case "userlist": {

      await getAdmin(ctx);

      const limit = parseNumber(deepGet(ctx.requestData.all, "limit", 50), 50);

      const page = parseNumber(

        deepGet(ctx.requestData.body, "page", deepGet(ctx.requestData.query, "page", 1)),

        1

      );

      const search = deepGet(ctx.requestData.body, "search", {}) as AnyObject;

      const group = parseNumber(deepGet(ctx.requestData.body, "search.group_id", -1), -1);

      let rows = (await sql<

        {

          id: number;

          avatar: string | null;

          mail: string | null;

          create_time: string | null;

          login_ip: string | null;

          register_ip: string | null;

          manager: number;

          login_fail_count: number;

          login_time: string | null;

          qq_open_id: string | null;

          nickname: string | null;

          status: number;

          active: string | null;

          group_id: number;

        }[]

      >`

        SELECT id, avatar, mail, create_time, login_ip, register_ip, manager, login_fail_count,

               login_time, qq_open_id, nickname, status, active::text AS active, group_id

        FROM "user"

      `) as any[];



      const mailKeyword = toStringValue(search.mail, "").trim().toLowerCase();

      const nicknameKeyword = toStringValue(search.nickname, "").trim().toLowerCase();

      const status = parseNumber(search.status, -1);

      if (mailKeyword) {

        rows = rows.filter((row) => toStringValue(row.mail, "").toLowerCase().includes(mailKeyword));

      }

      if (nicknameKeyword) {

        rows = rows.filter((row) =>

          toStringValue(row.nickname, "").toLowerCase().includes(nicknameKeyword)

        );

      }

      if (status >= 0) {

        rows = rows.filter((row) => row.status === status);

      }

      if (group >= 0) {

        rows = rows.filter((row) => parseNumber(row.group_id, 0) === group);

      }

      rows.sort((a, b) => b.id - a.id);

      return jsonSuccess("ok", paginateArray(rows, page, limit));

    }

    case "userupdate": {

      await getAdmin(ctx);

      assertNotDemoMode();

      const id = parseNumber(deepGet(ctx.requestData.body, "id", 0), 0);

      const data = { ...(ctx.requestData.body as AnyObject) };

      if (toStringValue(data.password, "").length > 0) {

        data.password = md5(toStringValue(data.password, ""));

      } else {

        delete data.password;

      }

      if (id > 0) {

        await sql`

          UPDATE "user"

          SET avatar = ${toStringValue(data.avatar, "")},

              mail = ${toStringValue(data.mail, "")},

              password = COALESCE(${data.password ? String(data.password) : null}, password),

              login_ip = ${toStringValue(data.login_ip, "")},

              register_ip = ${toStringValue(data.register_ip, "")},

              manager = ${parseNumber(data.manager, 0)},

              login_fail_count = ${parseNumber(data.login_fail_count, 0)},

              login_time = ${toStringValue(data.login_time, "") || null},

              qq_open_id = ${toStringValue(data.qq_open_id, "")},

              nickname = ${toStringValue(data.nickname, "")},

              status = ${parseNumber(data.status, 0)},

              group_id = ${parseNumber(data.group_id, 0)}

          WHERE id = ${id}

        `;

      } else {

        await sql`

          INSERT INTO "user"(

            avatar, mail, password, create_time, login_ip, register_ip, manager,

            login_fail_count, login_time, qq_open_id, nickname, status, active, group_id

          )

          VALUES (

            ${toStringValue(data.avatar, "")},

            ${toStringValue(data.mail, "")},

            ${toStringValue(data.password, md5(randomUUID()))},

            ${toStringValue(data.create_time, nowDateTimeString())},

            ${toStringValue(data.login_ip, "")},

            ${toStringValue(data.register_ip, "")},

            ${parseNumber(data.manager, 0)},

            ${parseNumber(data.login_fail_count, 0)},

            ${toStringValue(data.login_time, "") || null},

            ${toStringValue(data.qq_open_id, "")},

            ${toStringValue(data.nickname, "")},

            ${parseNumber(data.status, 0)},

            ${toStringValue(data.active, "") || null},

            ${parseNumber(data.group_id, 0)}

          )

        `;

      }

      return jsonSuccess("保存成功");

    }

    case "userdelete": {

      await getAdmin(ctx);

      assertNotDemoMode();

      const id = parseNumber(deepGet(ctx.requestData.body, "id", 0), 0);

      if (id > 0) {

        await sql`DELETE FROM link WHERE user_id = ${id}`;

        await sql`DELETE FROM tabbar WHERE user_id = ${id}`;

        await sql`DELETE FROM history WHERE user_id = ${id}`;

        await sql`DELETE FROM config WHERE user_id = ${id}`;

        await sql`DELETE FROM note WHERE user_id = ${id}`;

        await sql`DELETE FROM user_search_engine WHERE user_id = ${id}`;

        await sql`DELETE FROM token WHERE user_id = ${id}`;

        await sql`DELETE FROM "user" WHERE id = ${id}`;

      }

      return jsonSuccess("删除完毕");

    }

    case "export": {

      await getAdmin(ctx);

      assertNotDemoMode();

      const link = deepGet(ctx.requestData.body, "link", []);

      if (!link) {

        return jsonError("保存失败");

      }

      const savePath = toPublicAbsPath("static/exportsTabLink.json");

      await writeFile(savePath, JSON.stringify(link), "utf8");

      await sql`

        INSERT INTO setting(keys, value)

        VALUES ('defaultTab', 'static/exportsTabLink.json')

        ON CONFLICT (keys)

        DO UPDATE SET value = EXCLUDED.value

      `;

      ctx.settings = await refreshSettingsMap();

      return jsonSuccess("保存成功");

    }

    case "xycheck": {

      await getAdmin(ctx);

      const xyPath = path.join(ROOT_DIR, "xy.pem");

      const licensePath = path.join(ROOT_DIR, "config", "LICENSE.html");

      if ((await fileExists(xyPath)) && (await fileExists(licensePath))) {

        const [xy, lic] = await Promise.all([readFile(xyPath, "utf8"), readFile(licensePath, "utf8")]);

        if (xy === lic) {

          return jsonSuccess("ok");

        }

      }

      const license = (await fileExists(licensePath)) ? await readFile(licensePath, "utf8") : "";

      return jsonError("未找到证书文件", { license });

    }

    case "xy": {

      await getAdmin(ctx);

      const licensePath = path.join(ROOT_DIR, "config", "LICENSE.html");

      const xyPath = path.join(ROOT_DIR, "xy.pem");

      if (await fileExists(licensePath)) {

        await copyFile(licensePath, xyPath);

      }

      return jsonSuccess("ok");

    }

    case "getservicesstatus": {

      await getAdmin(ctx);

      const userNum = Number((await sql`SELECT COUNT(*)::int AS count FROM "user"`)[0]?.count ?? 0);

      const linkNum = Number((await sql`SELECT COUNT(*)::int AS count FROM linkstore`)[0]?.count ?? 0);

      const fileNum = Number((await sql`SELECT COUNT(*)::int AS count FROM file`)[0]?.count ?? 0);

      let userWeekActive = parseNumber(memoryCache.get("userWeekActive"), -1);

      if (userWeekActive < 0) {

        const startDate = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

        userWeekActive = Number(

          (await sql`

            SELECT COUNT(*)::int AS count

            FROM "user"

            WHERE active > ${startDate}

          `)[0]?.count ?? 0

        );

        memoryCache.set("userWeekActive", userWeekActive, 60);

      }

      return jsonSuccess("ok", {

        userNum,

        linkNum,

        redisNum: 0,

        fileNum,

        userWeekActive

      });

    }

    case "getuserline": {

      await getAdmin(ctx);

      const now = new Date();

      const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

      const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));

      const defaultDate = [first.toISOString().slice(0, 10), last.toISOString().slice(0, 10)];

      const dateSelect = toArray<string>(deepGet(ctx.requestData.body, "dateSelect", defaultDate));

      const startDate = dateSelect[0] ?? defaultDate[0];

      const endDate = dateSelect[1] ?? defaultDate[1];

      const rows = await sql<{ time: string; total: number }[]>`

        SELECT to_char(create_time::date, 'YYYY-MM-DD') AS time,

               COUNT(id)::int AS total

        FROM "user"

        WHERE create_time BETWEEN ${startDate}::timestamp AND ${endDate}::timestamp + interval '1 day'

        GROUP BY time

        ORDER BY time

      `;

      return jsonSuccess("ok", renderDateSeries(rows, startDate, endDate));

    }

    case "gethottab": {

      await getAdmin(ctx);

      const cached = memoryCache.get("hotTab");

      if (cached !== null) {

        return jsonSuccess("ok", cached);

      }

      const rows = await sql`

        SELECT *

        FROM linkstore

        ORDER BY install_num DESC

        LIMIT 30

      `;

      memoryCache.set("hotTab", rows, 60);

      return jsonSuccess("ok", rows);

    }

    case "userloginrecord": {

      await getAdmin(ctx);

      const userId = parseNumber(deepGet(ctx.requestData.body, "user_id", 0), 0);

      if (userId > 0 && !isDemoMode()) {

        const rows = await sql`

          SELECT user_id,

                 to_timestamp(create_time)::text AS create_time,

                 user_agent,

                 ip

          FROM token

          WHERE user_id = ${userId}

          ORDER BY create_time DESC

          LIMIT 100

        `;

        return jsonSuccess("", rows);

      }

      return jsonSuccess("", []);

    }

    case "repair":

      await getAdmin(ctx);

      assertNotDemoMode();

      return jsonSuccess("修复完毕");

    default:

      return jsonError("not action");

  }

}



function initAuthConfig(ctx: LegacyContext): { authCode: string; authService: string } {

  const authCode = settingValue(ctx.settings, "authCode", process.env.AUTH_CODE ?? "", true);

  const authService = settingValue(ctx.settings, "authServer", "https://auth.mtab.cc", true);

  return { authCode, authService };

}



function applyHtmlTemplate(

  template: string,

  values: {

    title: string;

    keywords: string;

    description: string;

    version: string;

    customHead: string;

    favicon: string;

  }

): string {

  return template

    .replace(/\{\$title\}/g, values.title)

    .replace(/\{\$keywords\}/g, values.keywords)

    .replace(/\{\$description\}/g, values.description)

    .replace(/\{\$version\}/g, values.version)

    .replace(/\{\$customHead\|raw\}/g, values.customHead)

    .replace(/\{\$favicon\}/g, values.favicon);

}



async function runInstallSql(sqlPath: string): Promise<void> {

  const content = await readFile(sqlPath, "utf8");

  const statements = content

    .split(";")

    .map((statement) => statement.trim())

    .filter(Boolean);

  for (const statement of statements) {

    try {

      await sql.unsafe(statement);

    } catch {

      // ignore

    }

  }

}



async function upsertCardFromInfo(
  info: AnyObject,
  options: { forceEnable?: boolean } = {}
): Promise<void> {

  const forceEnable = options.forceEnable === true;

  const name = toStringValue(info.name, "");

  const nameEn = toStringValue(info.name_en, "");

  if (!nameEn) {

    throw new Error("插件信息缺少 name_en");

  }

  const version = parseNumber(info.version, 0);

  const tips = toStringValue(info.tips, "");

  const src = toStringValue(info.src, "");

  const url = toStringValue(info.url, "");

  const window = toStringValue(info.window, "");

  const rawSetting = info.setting;

  const setting =

    rawSetting === undefined

      ? null

      : typeof rawSetting === "string"

        ? rawSetting

        : JSON.stringify(rawSetting);



  await sql`

    INSERT INTO card(name, name_en, version, tips, src, url, "window", setting, status)

    VALUES (

      ${name},

      ${nameEn},

      ${version},

      ${tips},

      ${src},

      ${url},

      ${window},

      ${setting},

      1

    )

    ON CONFLICT (name_en)

    DO UPDATE SET

      name = EXCLUDED.name,

      version = EXCLUDED.version,

      tips = EXCLUDED.tips,

      src = EXCLUDED.src,

      url = EXCLUDED.url,

      "window" = EXCLUDED."window",

      setting = EXCLUDED.setting,

      status = CASE

        WHEN ${forceEnable} THEN 1

        ELSE card.status

      END

  `;

}



async function syncLocalPluginCards(forceEnable = true): Promise<void> {

  const cacheKey = forceEnable ? "cards:sync-local:force" : "cards:sync-local";

  if (memoryCache.get(cacheKey) !== null) {

    return;

  }



  const pluginsDir = path.join(ROOT_DIR, "plugins");

  let entries: import("node:fs").Dirent[] = [];

  try {

    entries = await readdir(pluginsDir, { withFileTypes: true });

  } catch {

    memoryCache.set(cacheKey, true, 60);

    return;

  }



  for (const entry of entries) {

    if (!entry.isDirectory()) {

      continue;

    }



    const pluginName = sanitizePluginName(entry.name);

    if (!pluginName) {

      continue;

    }



    const infoPath = path.join(pluginsDir, pluginName, "info.json");

    if (!(await fileExists(infoPath))) {

      continue;

    }



    const info = await readJsonFile<AnyObject>(infoPath);

    if (!info) {

      continue;

    }



    if (!toStringValue(info.name_en, "").trim()) {

      info.name_en = pluginName;

    }

    if (!toStringValue(info.url, "").trim()) {

      info.url = `/plugins/${pluginName}/card`;

    }

    if (!toStringValue(info.window, "").trim()) {

      info.window = `/plugins/${pluginName}/window`;

    }



    try {

      await upsertCardFromInfo(info, { forceEnable });

    } catch {

      // ignore single plugin failure

    }

  }



  memoryCache.set(cacheKey, true, 60);

}


async function installCardFromRemote(

  ctx: LegacyContext,

  info: AnyObject

): Promise<NextResponse> {

  const downloadUrl = toStringValue(info.download, "").trim();

  const rawName = toStringValue(info.name_en, "").trim();

  if (!downloadUrl || !rawName) {

    return jsonError("没有需要安装的卡片插件");

  }

  const nameEn = sanitizePluginName(rawName);

  if (!nameEn) {

    return jsonError("插件名称无效");

  }



  const pluginsDir = path.join(ROOT_DIR, "plugins");

  await ensureDirectory(pluginsDir);

  await ensureDirectory(RUNTIME_DIR);



  const zipPath = path.join(RUNTIME_DIR, `${nameEn}.zip`);

  const extractedDir = path.join(RUNTIME_DIR, nameEn);

  await removeDirectory(extractedDir);

  await unlink(zipPath).catch(() => undefined);



  try {

    await downloadToFile(downloadUrl, zipPath);

    await extractZipTo(zipPath, RUNTIME_DIR);

  } catch (error) {

    await unlink(zipPath).catch(() => undefined);

    return jsonError(error instanceof Error ? error.message : "资源下载失败");

  }



  await unlink(zipPath).catch(() => undefined);

  if (!(await fileExists(extractedDir))) {

    return jsonError("插件解压失败");

  }



  const pluginDir = path.join(pluginsDir, nameEn);

  await copyDirectory(extractedDir, pluginDir);

  await removeDirectory(extractedDir);



  const installSql = path.join(pluginDir, "install.sql");

  if (await fileExists(installSql)) {

    await runInstallSql(installSql);

  }



  const infoPath = path.join(pluginDir, "info.json");

  const cardInfo = await readJsonFile<AnyObject>(infoPath);

  if (!cardInfo) {

    return jsonError("插件信息读取失败");

  }



  try {

    await upsertCardFromInfo(cardInfo);

  } catch (error) {

    return jsonError(error instanceof Error ? error.message : "插件信息写入失败");

  }

  return jsonSuccess("安装成功");

}



async function buildBrowserExtension(extInfo: AnyObject): Promise<NextResponse> {

  const name = toStringValue(extInfo.ext_name, "").trim();

  const description = toStringValue(extInfo.ext_description, "").trim();

  const version = toStringValue(extInfo.ext_version, "").trim();

  const domain = toStringValue(extInfo.ext_domain, "").trim();

  const protocol = toStringValue(extInfo.ext_protocol, "https").trim() || "https";

  const logo64 = toStringValue(extInfo.ext_logo_64, "").trim();

  const logo128 = toStringValue(extInfo.ext_logo_128, "").trim();

  const logo192 = toStringValue(extInfo.ext_logo_192, "").trim();



  if (!name || !version || !domain || !logo64 || !logo128 || !logo192) {

    return jsonError("扩展信息不完整");

  }



  const distDir = toPublicAbsPath("dist");

  if (!(await fileExists(distDir))) {

    return jsonError("前端资源不存在");

  }

  if (!(await fileExists(BROWSER_EXT_TEMPLATE_DIR))) {

    return jsonError("扩展模板不存在");

  }



  const buildDir = path.join(RUNTIME_DIR, "browserExt");

  await removeDirectory(buildDir);

  await copyDirectory(BROWSER_EXT_TEMPLATE_DIR, buildDir);

  await copyDirectory(distDir, path.join(buildDir, "dist"));

  await unlink(toPublicAbsPath("browserExt.zip")).catch(() => undefined);



  const iconDir = path.join(buildDir, "icon");

  await ensureDirectory(iconDir);



  const logo64Path = toPublicAbsPath(logo64);

  const logo128Path = toPublicAbsPath(logo128);

  const logo192Path = toPublicAbsPath(logo192);

  if (

    !(await fileExists(logo64Path)) ||

    !(await fileExists(logo128Path)) ||

    !(await fileExists(logo192Path))

  ) {

    return jsonError("扩展图标不存在");

  }

  await copyFile(logo64Path, path.join(iconDir, "64.png"));

  await copyFile(logo128Path, path.join(iconDir, "128.png"));

  await copyFile(logo192Path, path.join(iconDir, "192.png"));



  const host = domain.split(":")[0];

  const manifest = {

    name,

    description,

    version,

    manifest_version: 3,

    icons: {

      "64": "icon/64.png",

      "128": "icon/128.png",

      "192": "icon/192.png"

    },

    externally_connectable: {

      matches: [`*://${host}/*`]

    },

    background: {

      service_worker: "src/background.js"

    },

    permissions: ["background", "cookies", "bookmarks", "favicon"],

    action: {

      default_icon: "icon/64.png",

      default_title: name

    },

    host_permissions: [`*://${host}/*`, "*://*.baidu.com/*"],

    chrome_url_overrides: {

      newtab: "dist/index.html"

    }

  };

  await writeFile(

    path.join(buildDir, "manifest.json"),

    JSON.stringify(manifest, null, 0)

  );



  const indexPath = path.join(buildDir, "dist", "index.html");

  const indexTemplate = await readFile(indexPath, "utf8");

  const indexHtml = applyHtmlTemplate(indexTemplate, {

    title: name,

    keywords: "",

    description,

    version,

    customHead: '<script src="../src/init.js"></script>',

    favicon: "/icon/64.png"

  });

  await writeFile(indexPath, indexHtml);



  const initPath = path.join(buildDir, "src", "init.js");

  const initRaw = await readFile(initPath, "utf8");

  const initContent = initRaw

    .replace(/extDomain/g, host)

    .replace(/extUrl/g, `${protocol}://${domain}`);

  await writeFile(initPath, initContent);



  const zipPath = toPublicAbsPath("browserExt.zip");

  const zip = new AdmZip();

  zip.addLocalFolder(buildDir, path.basename(buildDir));

  zip.writeZip(zipPath);



  await removeDirectory(buildDir);

  return jsonSuccess("打包完毕", { url: "/browserExt.zip" });

}



async function handleAdminIndexController(

  ctx: LegacyContext,

  action: string

): Promise<NextResponse> {

  switch (action.toLowerCase()) {

    case "setsubscription": {

      await getAdmin(ctx);

      const code = toStringValue(deepGet(ctx.requestData.body, "code", "")).trim();

      if (code) {

        await sql`

          INSERT INTO setting(keys, value)

          VALUES ('authCode', ${code})

          ON CONFLICT (keys)

          DO UPDATE SET value = EXCLUDED.value

        `;

        ctx.settings = await refreshSettingsMap();

      }

      return jsonSuccess("ok");

    }

    case "authorization": {

      await getAdmin(ctx);

      const { authCode, authService } = initAuthConfig(ctx);

      const info: AnyObject = {

        version: APP_VERSION,

        version_code: APP_VERSION_CODE,

        php_version: process.version

      };

      try {

        const response = await fetch(`${authService}/checkAuth`, {

          method: "POST",

          headers: {

            "Content-Type": "application/x-www-form-urlencoded"

          },

          body: new URLSearchParams({

            authorization_code: authCode,

            version_code: String(APP_VERSION_CODE),

            domain: ctx.request.nextUrl.origin

          }).toString()

        });

        if (response.ok) {

          const remote = (await response.json()) as AnyObject;

          info.remote = remote;

          return jsonSuccess(info);

        }

      } catch {

        // ignore

      }

      info.remote = { auth: Boolean(authCode) };

      return jsonSuccess("授权服务器连接失败", info);

    }

    case "updateapp":

      await getAdmin(ctx);

      return jsonError("Next.js 版本不支持在线升级，请使用 git 或部署流程更新");

    case "localcard": {

      await getAdmin(ctx);

      const rows = await sql`SELECT * FROM card`;

      return jsonSuccess("ok", rows);

    }

    case "cardlist": {

      await getAdmin(ctx);

      const { authCode, authService } = initAuthConfig(ctx);

      try {

        const response = await fetch(`${authService}/card`, {

          method: "POST",

          headers: {

            "Content-Type": "application/x-www-form-urlencoded"

          },

          body: new URLSearchParams({

            authorization_code: authCode

          }).toString()

        });

        const json = (await response.json()) as AnyObject;

        if (parseNumber(json.code, 0) === 1) {

          return jsonSuccess("ok", json.data ?? []);

        }

      } catch {

        // ignore

      }

      return jsonError("远程卡片获取失败");

    }

    case "stopcard": {

      await getAdmin(ctx);

      assertNotDemoMode();

      const nameEn = toStringValue(deepGet(ctx.requestData.body, "name_en", ""));

      await sql`UPDATE card SET status = 0 WHERE name_en = ${nameEn}`;

      return jsonSuccess("设置成功");

    }

    case "startcard": {

      await getAdmin(ctx);

      const nameEn = toStringValue(deepGet(ctx.requestData.body, "name_en", ""));

      await sql`UPDATE card SET status = 1 WHERE name_en = ${nameEn}`;

      return jsonSuccess("设置成功");

    }

    case "installcard": {

      await getAdmin(ctx);

      const { authCode, authService } = initAuthConfig(ctx);

      const nameEn = toStringValue(deepGet(ctx.requestData.body, "name_en", ""));

      const type = toStringValue(deepGet(ctx.requestData.body, "type", "install"));

      const existing = await sql<{ id: number; version: number }[]>`

        SELECT id, version

        FROM card

        WHERE name_en = ${nameEn}

        LIMIT 1

      `;

      if (existing.length > 0 && type === "install") {

        return jsonError("您已安装当前卡片组件");

      }

      let version = 0;

      if (existing.length > 0 && type === "update") {

        version = parseNumber(existing[0].version, 0);

      }

      try {

        const response = await fetch(`${authService}/installCard`, {

          method: "POST",

          headers: {

            "Content-Type": "application/x-www-form-urlencoded"

          },

          body: new URLSearchParams({

            authorization_code: authCode,

            name_en: nameEn,

            version: String(version),

            version_code: String(APP_VERSION_CODE)

          }).toString()

        });

        const json = (await response.json()) as AnyObject;

        if (parseNumber(json.code, 0) === 0) {

          return jsonError(toStringValue(json.msg, "安装失败"));

        }

        return installCardFromRemote(ctx, (json.data ?? {}) as AnyObject);

      } catch (error) {

        return jsonError(error instanceof Error ? error.message : "安装失败");

      }

    }

    case "uninstallcard": {

      await getAdmin(ctx);

      assertNotDemoMode();

      const nameEn = toStringValue(deepGet(ctx.requestData.body, "name_en", ""));

      const safeName = sanitizePluginName(nameEn);

      if (safeName) {

        await removeDirectory(path.join(ROOT_DIR, "plugins", safeName));

      }

      await sql`DELETE FROM card WHERE name_en = ${nameEn}`;

      return jsonSuccess("卸载完毕！");

    }

    case "build": {

      await getAdmin(ctx);

      assertNotDemoMode();

      if (!ctx.auth) {

        return jsonError("请获取授权后进行操作");

      }

      const extInfo = deepGet(ctx.requestData.body, "extInfo", {}) as AnyObject;

      return buildBrowserExtension(extInfo);

    }

    case "folders": {

      await getAdmin(ctx);

      const { authCode, authService } = initAuthConfig(ctx);

      try {

        const response = await fetch(`${authService}/client/folders`, {

          method: "POST",

          headers: {

            "Content-Type": "application/x-www-form-urlencoded"

          },

          body: new URLSearchParams({

            authorization_code: authCode

          }).toString()

        });

        const json = (await response.json()) as AnyObject;

        if (parseNumber(json.code, 0) === 1) {

          return jsonSuccess("ok", json.data ?? []);

        }

      } catch {

        // ignore

      }

      return jsonSuccess("获取失败");

    }

    case "links": {

      await getAdmin(ctx);

      const { authCode, authService } = initAuthConfig(ctx);

      const folders = toStringValue(deepGet(ctx.requestData.query, "folders", ""));

      const page = parseNumber(deepGet(ctx.requestData.query, "page", 1), 1);

      const limit = parseNumber(deepGet(ctx.requestData.query, "limit", 18), 18);

      try {

        const response = await fetch(`${authService}/client/links`, {

          method: "POST",

          headers: {

            "Content-Type": "application/x-www-form-urlencoded"

          },

          body: new URLSearchParams({

            folders,

            limit: String(limit),

            page: String(page),

            authorization_code: authCode

          }).toString()

        });

        const json = (await response.json()) as AnyObject;

        if (parseNumber(json.code, 0) === 1) {

          const remoteList = toArray<AnyObject>(deepGet(json, "data.data", []));

          const names = remoteList.map((item) => toStringValue(item.name, ""));

          const urls = remoteList.map((item) => toStringValue(item.url, ""));

          const localRows = await sql`

            SELECT *

            FROM linkstore

            WHERE name = ANY(${sql.array(names)})

               OR url = ANY(${sql.array(urls)})

          `;

          return NextResponse.json({

            code: 1,

            msg: "ok",

            data: json.data ?? {},

            local: localRows

          });

        }

      } catch {

        // ignore

      }

      return jsonSuccess("获取失败");

    }

    default:

      return jsonError("not action");

  }

}



const DEFAULT_FOOD_LIST = [

  "麻婆豆腐",

  "火锅",

  "饺子",

  "炒饭",

  "酸辣粉",

  "烤肉",

  "拉面",

  "水煮鱼",

  "宫保鸡丁",

  "番茄牛腩"

];



const DEFAULT_POETRY_LIST = [

  { text: "床前明月光，疑是地上霜。", author: "李白《静夜思》" },

  { text: "海内存知己，天涯若比邻。", author: "王勃《送杜少府之任蜀州》" },

  { text: "会当凌绝顶，一览众山小。", author: "杜甫《望岳》" },

  { text: "山重水复疑无路，柳暗花明又一村。", author: "陆游《游山西村》" },

  { text: "不识庐山真面目，只缘身在此山中。", author: "苏轼《题西林壁》" }

];



async function handleAppsFoodController(

  ctx: LegacyContext,

  action: string

): Promise<NextResponse> {

  switch (action.toLowerCase()) {

    case "foodlist": {

      const list = await cardConfigValue("food", "foodList", DEFAULT_FOOD_LIST);

      return jsonSuccess("ok", list);

    }

    case "foodlistsave": {

      await getAdmin(ctx);

      const foods = toArray<string>(deepGet(ctx.requestData.body, "foods", []));

      await saveCardConfig("food", "foodList", foods);

      return jsonSuccess("保存成功");

    }

    default:

      return jsonError("not action");

  }

}



async function handleAppsPoetryController(

  ctx: LegacyContext,

  action: string

): Promise<NextResponse> {

  switch (action.toLowerCase()) {

    case "poetrylist": {

      await getAdmin(ctx);

      const list = await cardConfigValue("poetry", "poetryList", DEFAULT_POETRY_LIST);

      return jsonSuccess("ok", list);

    }

    case "reset":

      await getAdmin(ctx);

      await saveCardConfig("poetry", "poetryList", []);

      return jsonSuccess("ok");

    case "poetryone": {

      const list = await cardConfigValue("poetry", "poetryList", DEFAULT_POETRY_LIST);

      const source = Array.isArray(list) && list.length > 0 ? list : DEFAULT_POETRY_LIST;

      const random = source[Math.floor(Math.random() * source.length)];

      return jsonSuccess("ok", random);

    }

    case "poetrylistsave": {

      await getAdmin(ctx);

      const list = toArray<AnyObject>(deepGet(ctx.requestData.body, "list", []));

      const sliced = list.slice(0, 300);

      await saveCardConfig("poetry", "poetryList", sliced);

      if (list.length > 300) {

        return jsonSuccess("最多只能保存 300 条，超出部分将被忽略");

      }

      return jsonSuccess("保存成功");

    }

    default:

      return jsonError("not action");

  }

}



async function topSearchCacheDelete(): Promise<void> {

  const keys = [

    "bilibiliTopSearch",

    "baiduTopSearch",

    "weiboTopSearch",

    "zhiHuTopSearch",

    "douyinTopSearch",

    "toutiaoTopSearch"

  ];

  for (const key of keys) {

    memoryCache.delete(key);

  }

}



async function getTopSearchConf(): Promise<AnyObject> {

  const confWrap = await cardConfigValue("topSearch", "conf", {});

  if (typeof confWrap === "object" && confWrap !== null) {

    return confWrap as AnyObject;

  }

  return {};

}



async function getTopSearchTtl(): Promise<number> {

  const conf = await getTopSearchConf();

  return parseNumber(conf.ttl, 180);

}



async function fetchTopSearch(

  cacheKey: string,

  ttl: number,

  runner: () => Promise<AnyObject[]>

): Promise<AnyObject[]> {

  const cached = memoryCache.get(cacheKey);

  if (cached !== null) {

    return cached as AnyObject[];

  }

  const data = await runner();

  memoryCache.set(cacheKey, data, ttl);

  return data;

}



async function handleAppsTopSearchController(

  ctx: LegacyContext,

  action: string

): Promise<NextResponse> {

  const ttl = await getTopSearchTtl();

  switch (action.toLowerCase()) {

    case "save": {

      await getAdmin(ctx);

      const conf = deepGet(ctx.requestData.body, "conf", {});

      await saveCardConfigs("topSearch", { conf: conf as AnyObject });

      await topSearchCacheDelete();

      return jsonSuccess("保存成功");

    }

    case "getconf": {

      await getAdmin(ctx);

      const conf = await getTopSearchConf();

      return jsonSuccess("ok", conf);

    }

    case "topsearch": {

      const type = toStringValue(deepGet(ctx.requestData.query, "type", "baidu"));

      return handleAppsTopSearchController(ctx, type);

    }

    case "zhihu": {

      const list = await fetchTopSearch("zhiHuTopSearch", ttl, async () => {

        const response = await fetch(

          "https://www.zhihu.com/api/v4/creators/rank/hot?domain=0&period=hour&limit=50&offset=0"

        );

        if (!response.ok) {

          return [];

        }

        const json = (await response.json()) as AnyObject;

        const data = toArray<AnyObject>(json.data);

        return data.map((item) => ({

          title: toStringValue(deepGet(item, "question.title", "")),

          hot: deepGet(item, "reaction.pv", 0),

          url: toStringValue(deepGet(item, "question.url", ""))

        }));

      });

      return jsonSuccess(list);

    }

    case "baidu":

    case "baidutopsearch": {

      const list = await fetchTopSearch("baiduTopSearch", ttl, async () => {

        const response = await fetch("https://top.baidu.com/api/board?tab=realtime");

        if (!response.ok) {

          return [];

        }

        const json = (await response.json()) as AnyObject;

        if (!json.success) {

          return [];

        }

        const card = deepGet(json, "data.cards.0", {}) as AnyObject;

        const topContent = toArray<AnyObject>(card.topContent);

        const content = toArray<AnyObject>(card.content);

        if (topContent.length > 0) {

          content.unshift(topContent[0]);

        }

        const conf = await getTopSearchConf();

        const tn = toStringValue(conf.baiduCode, "");

        return content.map((item) => {

          const word = toStringValue(item.word, "");

          const query = tn ? `${encodeURIComponent(word)}&tn=${tn}` : encodeURIComponent(word);

          return {

            title: word,

            hot: parseNumber(item.hotScore, 0),

            url: `https://www.baidu.com/s?wd=${query}`

          };

        });

      });

      return jsonSuccess("new", list);

    }

    case "bilibili": {

      const list = await fetchTopSearch("bilibiliTopSearch", ttl, async () => {

        const response = await fetch(

          "https://api.bilibili.com/x/web-interface/ranking/v2?rid=0&type=all",

          {

            headers: {

              "User-Agent":

                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"

            }

          }

        );

        if (!response.ok) {

          return [];

        }

        const json = (await response.json()) as AnyObject;

        if (parseNumber(json.code, -1) !== 0) {

          return [];

        }

        const data = toArray<AnyObject>(deepGet(json, "data.list", [])).slice(0, 90);

        return data.map((item) => ({

          title: toStringValue(item.title, ""),

          hot: parseNumber(deepGet(item, "stat.view", 0), 0),

          url: `https://www.bilibili.com/video/${toStringValue(item.bvid, "")}`

        }));

      });

      return jsonSuccess(list);

    }

    case "weibo": {

      const list = await fetchTopSearch("weiboTopSearch", ttl, async () => {

        const response = await fetch("https://weibo.com/ajax/statuses/hot_band");

        if (!response.ok) {

          return [];

        }

        const json = (await response.json()) as AnyObject;

        if (parseNumber(json.ok, 0) !== 1) {

          return [];

        }

        const data = toArray<AnyObject>(deepGet(json, "data.band_list", []));

        return data.map((item) => ({

          title: toStringValue(item.word, ""),

          hot: parseNumber(item.raw_hot ?? item.num, 0),

          url: `https://s.weibo.com/weiboo?q=${encodeURIComponent(toStringValue(item.word, ""))}`

        }));

      });

      return jsonSuccess(list);

    }

    case "toutiao": {

      const list = await fetchTopSearch("toutiaoTopSearch", ttl, async () => {

        const response = await fetch(

          "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc"

        );

        if (!response.ok) {

          return [];

        }

        const json = (await response.json()) as AnyObject;

        if (toStringValue(json.status, "") !== "success") {

          return [];

        }

        const data = toArray<AnyObject>(json.data);

        return data.map((item) => ({

          title: toStringValue(item.Title, ""),

          hot: parseNumber(item.HotValue, 0),

          url: toStringValue(item.Url, "")

        }));

      });

      return jsonSuccess(list);

    }

    case "douyin": {

      const list = await fetchTopSearch("douyinTopSearch", ttl, async () => {

        const response = await fetch(

          "https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/?reflow_source=reflow_page"

        );

        if (!response.ok) {

          return [];

        }

        const json = (await response.json()) as AnyObject;

        const data = toArray<AnyObject>(json.word_list);

        return data.map((item) => ({

          title: toStringValue(item.word, ""),

          hot: parseNumber(item.hot_value ?? item.num, 0),

          url: `https://www.douyin.com/search/${encodeURIComponent(toStringValue(item.word, ""))}`

        }));

      });

      return jsonSuccess(list);

    }

    case "clearrediscache":

      await topSearchCacheDelete();

      return jsonSuccess("刷新完毕");

    default:

      return jsonError("not action");

  }

}



async function handleAppsTodoController(

  ctx: LegacyContext,

  action: string

): Promise<NextResponse> {

  switch (action.toLowerCase()) {

    case "getfolderandtodo": {

      const user = await getUser(ctx, true);

      if (!user) {

        return jsonError("请登录后操作");

      }

      const [folders, todos] = await Promise.all([

        sql`

          SELECT *

          FROM plugins_todo_folder

          WHERE user_id = ${user.user_id}

          ORDER BY create_time

        `,

        sql`

          SELECT *

          FROM plugins_todo

          WHERE user_id = ${user.user_id}

          ORDER BY create_time DESC

        `

      ]);

      return jsonSuccess("ok", { folder: folders, todo: todos });

    }

    case "createfolder": {

      const user = await getUser(ctx, true);

      if (!user) {

        return jsonError("请登录后操作");

      }

      const name = toStringValue(deepGet(ctx.requestData.body, "name", ""));

      const id = parseNumber(deepGet(ctx.requestData.body, "id", 0), 0);

      if (name && id) {

        const result = await sql`

          UPDATE plugins_todo_folder

          SET name = ${name}

          WHERE id = ${id}

            AND user_id = ${user.user_id}

          RETURNING *

        `;

        if (result.length > 0) {

          return jsonSuccess("修改成功", result[0]);

        }

        return jsonError("修改失败");

      }

      const count = Number(

        (await sql`

          SELECT COUNT(*)::int AS count

          FROM plugins_todo_folder

          WHERE user_id = ${user.user_id}

        `)[0]?.count ?? 0

      );

      if (count > 20) {

        return jsonError("最多可以创建 20 个列表");

      }

      const rows = await sql`

        INSERT INTO plugins_todo_folder(user_id, name, create_time)

        VALUES (${user.user_id}, '待办事项', ${nowDateTimeString()})

        RETURNING *

      `;

      return jsonSuccess("ok", rows[0] ?? {});

    }

    case "createtodo": {

      const user = await getUser(ctx, true);

      if (!user) {

        return jsonError("请登录后操作");

      }

      const id = parseNumber(deepGet(ctx.requestData.body, "id", 0), 0);

      const form = ctx.requestData.body as AnyObject;

      if (id > 0) {

        if (toStringValue(form.todo, "").length > 500) {

          return jsonError("待办内容不能超过 500 字，请分割待办事项");

        }

        await sql`

          UPDATE plugins_todo

          SET todo = ${toStringValue(form.todo, "")},

              status = ${parseNumber(form.status, 0)},

              weight = ${parseNumber(form.weight, 0)},

              folder = ${toStringValue(form.folder, "")},

              expire_time = ${toStringValue(form.expire_time, "") || null}

          WHERE id = ${id}

            AND user_id = ${user.user_id}

        `;

        return jsonSuccess("ok");

      }

      const count = Number(

        (await sql`

          SELECT COUNT(*)::int AS count

          FROM plugins_todo

          WHERE user_id = ${user.user_id}

        `)[0]?.count ?? 0

      );

      if (count > 300) {

        return jsonError("最多可以创建 300 条待办");

      }

      const rows = await sql`

        INSERT INTO plugins_todo(todo, user_id, status, weight, create_time, folder)

        VALUES (

          ${toStringValue(form.todo, "")},

          ${user.user_id},

          0,

          0,

          ${nowDateTimeString()},

          ${toStringValue(form.folder, "")}

        )

        RETURNING *

      `;

      return jsonSuccess("ok", rows[0] ?? {});

    }

    case "delfolder": {

      const user = await getUser(ctx, true);

      if (!user) {

        return jsonError("请登录后操作");

      }

      const id = parseNumber(deepGet(ctx.requestData.body, "id", 0), 0);

      const folder = await sql<{ id: number }[]>`

        SELECT id

        FROM plugins_todo_folder

        WHERE user_id = ${user.user_id}

          AND id = ${id}

        LIMIT 1

      `;

      if (folder.length > 0) {

        await sql`

          DELETE FROM plugins_todo

          WHERE user_id = ${user.user_id}

            AND folder = ${String(id)}

        `;

        await sql`

          DELETE FROM plugins_todo_folder

          WHERE user_id = ${user.user_id}

            AND id = ${id}

        `;

        return jsonSuccess("删除完毕");

      }

      return jsonSuccess("删除失败");

    }

    case "deltodo": {

      const user = await getUser(ctx, true);

      if (!user) {

        return jsonError("请登录后操作");

      }

      const id = parseNumber(deepGet(ctx.requestData.body, "id", 0), 0);

      if (id > 0) {

        await sql`

          DELETE FROM plugins_todo

          WHERE user_id = ${user.user_id}

            AND id = ${id}

        `;

      }

      return jsonSuccess("删除完毕");

    }

    default:

      return jsonError("not action");

  }

}



async function handleAppsWeatherController(

  ctx: LegacyContext,

  action: string

): Promise<NextResponse> {

  const gateway = toStringValue(

    await cardConfigValue("weather", "gateway", "https://devapi.qweather.com"),

    "https://devapi.qweather.com"

  );

  const apiKey = toStringValue(await cardConfigValue("weather", "key", ""), "");

  switch (action.toLowerCase()) {

    case "ip": {

      const ip = getRealIp(ctx.request);

      try {

        const response = await fetch(`https://ipapi.co/${ip}/json/`);

        if (response.ok) {

          const data = (await response.json()) as AnyObject;

          const latitude = Number(data.latitude ?? 39.91);

          const longitude = Number(data.longitude ?? 116.41);

          return NextResponse.json({

            code: 1,

            msg: "success",

            data: {

              ipAddress: ip,

              latitude,

              longitude,

              cityName: toStringValue(data.city, ""),

              regionName: toStringValue(data.region, ""),

              countryName: toStringValue(data.country_name, "")

            }

          });

        }

      } catch {

        // ignore

      }

      return NextResponse.json({

        code: 1,

        msg: "success",

        data: {

          ipAddress: ip,

          latitude: 39.91,

          longitude: 116.41,

          cityName: "",

          regionName: "",

          countryName: ""

        }

      });

    }

    case "setting": {

      await getAdmin(ctx);

      if (ctx.request.method.toUpperCase() === "POST") {

        const form = ctx.requestData.body as AnyObject;

        await saveCardConfigs("weather", form);

        return jsonSuccess("保存成功");

      }

      if (ctx.request.method.toUpperCase() === "PUT") {

        const conf = await loadCardConfig("weather");

        return jsonSuccess("ok", conf);

      }

      return jsonError("not support");

    }

    case "everyday": {

      const location = toStringValue(
        deepGet(
          ctx.requestData.all,
          "location",
          deepGet(ctx.requestData.all, "cityId", "101010100")
        )
      );

      try {

        const url = new URL("/v7/weather/7d", gateway);

        url.searchParams.set("location", location);

        url.searchParams.set("key", apiKey);

        const response = await fetch(url.toString());

        if (response.ok) {

          const json = (await response.json()) as AnyObject;

          if (toStringValue(json.code, "") === "200") {

            return jsonSuccess(json.daily ?? []);

          }

        }

      } catch {

        // ignore

      }

      return jsonError("数据获取错误");

    }

    case "now": {

      const location = toStringValue(
        deepGet(
          ctx.requestData.all,
          "location",
          deepGet(ctx.requestData.all, "cityId", "101010100")
        )
      );

      try {

        const url = new URL("/v7/weather/now", gateway);

        url.searchParams.set("location", location);

        url.searchParams.set("key", apiKey);

        const response = await fetch(url.toString());

        if (response.ok) {

          const json = (await response.json()) as AnyObject;

          if (toStringValue(json.code, "") === "200") {

            return jsonSuccess(json.now ?? {});

          }

        }

      } catch {

        // ignore

      }

      return jsonError("数据获取错误");

    }

    case "locationtocity": {

      const location = toStringValue(

        deepGet(ctx.requestData.all, "location", "101010100")

      );

      try {

        const url = new URL("https://geoapi.qweather.com/v2/city/lookup");

        url.searchParams.set("location", location);

        url.searchParams.set("key", apiKey);

        const response = await fetch(url.toString());

        if (response.ok) {

          const json = (await response.json()) as AnyObject;

          if (toStringValue(json.code, "") === "200") {

            const list = toArray<AnyObject>(json.location);

            if (list.length > 0) {

              return jsonSuccess(list[0]);

            }

          }

        }

      } catch {

        // ignore

      }

      return jsonError("数据获取错误");

    }

    case "citysearch": {

      const city = toStringValue(deepGet(ctx.requestData.all, "city", "")).trim();

      if (!city) {

        return jsonError("数据获取错误");

      }

      try {

        const url = new URL("https://geoapi.qweather.com/v2/city/lookup");

        url.searchParams.set("location", city);

        url.searchParams.set("key", apiKey);

        const response = await fetch(url.toString());

        if (response.ok) {

          const json = (await response.json()) as AnyObject;

          if (toStringValue(json.code, "") === "200") {

            return jsonSuccess(json.location ?? []);

          }

        }

      } catch (error) {

        return jsonError(error instanceof Error ? error.message : "数据获取错误");

      }

      return jsonError("数据获取错误");

    }

    default:

      return jsonError("not action");

  }

}




async function addAiMessage(
  userId: number,
  dialogueId: number,
  role: string,
  message: string,
  reasoning: string = ""
): Promise<void> {
  await sql`
    INSERT INTO ai(message, role, create_time, dialogue_id, user_id, reasoning_content)
    VALUES (
      ${message},
      ${role},
      ${nowDateTimeString()},
      ${dialogueId},
      ${userId},
      ${reasoning}
    )
  `;
}

async function getAiModel(modelId: number, userId: number): Promise<AnyObject | null> {
  if (modelId > 0) {
    const rows = await sql<AnyObject[]>`
      SELECT * FROM ai_model
      WHERE id = ${modelId}
        AND status = 1
        AND (user_id = ${userId} OR user_id IS NULL)
      LIMIT 1
    `;
    return rows[0] ?? null;
  }
  const rows = await sql<AnyObject[]>`
    SELECT * FROM ai_model
    WHERE status = 1
      AND (user_id = ${userId} OR user_id IS NULL)
    ORDER BY id ASC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function handleAiStream(ctx: LegacyContext): Promise<NextResponse> {
  const input = toStringValue(deepGet(ctx.requestData.body, "input", "")).trim();
  const dialogueId = parseNumber(deepGet(ctx.requestData.body, "dialogue_id", 0), 0);
  const modelId = parseNumber(deepGet(ctx.requestData.body, "model", 0), 0);
  const user = await getUser(ctx, true);
  if (!user) {
    return jsonError("??????");
  }
  const model = await getAiModel(modelId, user.user_id);
  if (!model) {
    return jsonError("?????");
  }
  const dialogueRows = await sql<AnyObject[]>`
    SELECT * FROM dialogue WHERE id = ${dialogueId} AND user_id = ${user.user_id} LIMIT 1
  `;
  if (dialogueRows.length === 0) {
    return jsonError("?????");
  }
  const dialogue = dialogueRows[0];
  const historyRows = await sql<{ role: string; message: string }[]>`
    SELECT role, message
    FROM ai
    WHERE user_id = ${user.user_id}
      AND dialogue_id = ${dialogueId}
    ORDER BY create_time ASC
  `;
  await addAiMessage(user.user_id, dialogueId, "user", input, "");
  if (!dialogue.title || parseNumber(dialogue.mode_id, 0) !== modelId) {
    const title = dialogue.title || input.slice(0, 30);
    await sql`
      UPDATE dialogue
      SET title = ${title}, mode_id = ${modelId}
      WHERE id = ${dialogueId}
    `;
  }
  const messages = historyRows.map((row) => ({ role: row.role, content: row.message }));
  messages.push({ role: "user", content: input });
  const systemContent = toStringValue(model.system_content, "");
  if (systemContent) {
    messages.unshift({ role: "system", content: systemContent });
  }
  const payload = {
    model: toStringValue(model.model, ""),
    messages,
    stream: true
  };
  const apiHost = toStringValue(model.api_host, "");
  const apiKey = toStringValue(model.sk, "");
  if (!apiHost || !apiKey) {
    return jsonError("???????");
  }
  const upstream = await fetch(apiHost, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  if (!upstream.ok || !upstream.body) {
    return jsonError("????");
  }
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            controller.enqueue(value);
          }
        }
      } catch (error) {
        controller.enqueue(encoder.encode(JSON.stringify({ code: 0, msg: "????" })));
      }
      let content = "";
      let reasoning = "";
      for (const line of buffer.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) {
          continue;
        }
        const jsonStr = trimmed.slice(5).trim();
        if (!jsonStr || jsonStr === "[DONE]") {
          continue;
        }
        try {
          const json = JSON.parse(jsonStr) as AnyObject;
          const choices = Array.isArray((json as AnyObject).choices)
            ? ((json as AnyObject).choices as AnyObject[])
            : [];
          const delta = (choices[0]?.delta ?? {}) as AnyObject;
          const chunk = toStringValue(delta.content, "");
          const reasoningChunk = toStringValue(delta.reasoning_content, "");
          if (chunk) {
            content += chunk;
          }
          if (reasoningChunk) {
            reasoning += reasoningChunk;
          }
        } catch {
          // ignore
        }
      }
      if (content || reasoning) {
        await addAiMessage(user.user_id, dialogueId, "assistant", content, reasoning);
      }
      controller.close();
    }
  });
  return new NextResponse(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}

async function handleAppsAiController(ctx: LegacyContext, action: string): Promise<NextResponse> {
  switch (action.toLowerCase()) {
    case "dialogues": {
      const user = await getUser(ctx, true);
      if (!user) {
        return jsonError("??????");
      }
      const offset = parseNumber(deepGet(ctx.requestData.body, "offset", 0), 0);
      const limit = parseNumber(deepGet(ctx.requestData.body, "limit", 50), 50);
      const rows = await sql`
        SELECT id, title, create_time, mode_id
        FROM dialogue
        WHERE user_id = ${user.user_id}
        ORDER BY create_time DESC
        OFFSET ${offset}
        LIMIT ${limit}
      `;
      return jsonSuccess("ok", { data: rows });
    }
    case "createdialogues": {
      const user = await getUser(ctx, true);
      if (!user) {
        return jsonError("??????");
      }
      const modelId = parseNumber(deepGet(ctx.requestData.body, "model", 0), 0);
      const rows = await sql`
        INSERT INTO dialogue(user_id, mode_id, create_time, title)
        VALUES (${user.user_id}, ${modelId}, ${nowDateTimeString()}, '')
        RETURNING id, create_time, title
      `;
      const row = rows[0] ?? { id: 0, create_time: nowDateTimeString(), title: "" };
      return jsonSuccess("ok", { id: row.id, create_time: row.create_time, title: row.title ?? "" });
    }
    case "messagelist": {
      const user = await getUser(ctx, true);
      if (!user) {
        return jsonError("??????");
      }
      const dialogueId = parseNumber(deepGet(ctx.requestData.body, "dialogue_id", 0), 0);
      const rows = await sql`
        SELECT *
        FROM ai
        WHERE user_id = ${user.user_id}
          AND dialogue_id = ${dialogueId}
        ORDER BY create_time ASC
      `;
      return jsonSuccess("ok", rows);
    }
    case "deletedialogues": {
      const user = await getUser(ctx, true);
      if (!user) {
        return jsonError("??????");
      }
      const dialogueId = parseNumber(deepGet(ctx.requestData.body, "dialogue_id", 0), 0);
      const rows = await sql`
        SELECT id FROM dialogue WHERE user_id = ${user.user_id} AND id = ${dialogueId} LIMIT 1
      `;
      if (rows.length === 0) {
        return jsonError("?????");
      }
      await sql`DELETE FROM dialogue WHERE id = ${dialogueId}`;
      await sql`DELETE FROM ai WHERE dialogue_id = ${dialogueId}`;
      return jsonSuccess("ok");
    }
    case "redialoguetitle": {
      const user = await getUser(ctx, true);
      if (!user) {
        return jsonError("??????");
      }
      const dialogueId = parseNumber(deepGet(ctx.requestData.body, "dialogue_id", 0), 0);
      const title = toStringValue(deepGet(ctx.requestData.body, "title", ""));
      await sql`
        UPDATE dialogue
        SET title = ${title}
        WHERE user_id = ${user.user_id} AND id = ${dialogueId}
      `;
      return jsonSuccess("ok");
    }
    case "cleardialog": {
      const user = await getUser(ctx, true);
      if (!user) {
        return jsonError("??????");
      }
      await sql`DELETE FROM dialogue WHERE user_id = ${user.user_id}`;
      await sql`DELETE FROM ai WHERE user_id = ${user.user_id}`;
      return jsonSuccess("ok");
    }
    case "index":
    case "msg":
      return handleAiStream(ctx);
    default:
      return jsonError("not action");
  }
}


async function handleAppsController(

  ctx: LegacyContext,

  controllerPath: string,

  action: string

): Promise<NextResponse> {

  const key = controllerPath.toLowerCase();

  if (key === "apps.food.index") {

    return handleAppsFoodController(ctx, action);

  }

  if (key === "apps.ai.ai") {

    return handleAppsAiController(ctx, action);

  }

  if (key === "apps.poetry.index") {

    return handleAppsPoetryController(ctx, action);

  }

  if (key === "apps.todo.index") {

    return handleAppsTodoController(ctx, action);

  }

  if (key === "apps.topsearch.index") {

    return handleAppsTopSearchController(ctx, action);

  }

  if (key === "apps.weather.index") {

    return handleAppsWeatherController(ctx, action);

  }

  return jsonError("not controller");

}



async function dispatchController(

  ctx: LegacyContext,

  controllerPath: string,

  action: string

): Promise<NextResponse> {

  const normalized = controllerPath.toLowerCase();

  if (normalized.startsWith("apps.")) {

    return handleAppsController(ctx, normalized, action);

  }



  const map: Record<string, (context: LegacyContext, method: string) => Promise<NextResponse>> = {

    index: handleIndexController,

    api: handleApiController,

    user: handleUserController,

    config: handleConfigController,

    tabbar: handleTabbarController,

    link: handleLinkController,

    searchengine: handleSearchEngineController,

    note: handleNoteController,

    linkstore: handleLinkStoreController,

    file: handleFileController,

    wallpaper: handleWallpaperController,

    setting: handleSettingController,

    admin: handleAdminController,

    "admin.index": handleAdminIndexController,

    card: handleCardController

  };

  const handler = map[normalized];

  if (!handler) {

    return jsonError("not controller");

  }

  return handler(ctx, action);

}



async function servePluginFile(
  pluginName: string,
  folder: "static" | "view",
  fileRelative: string,
  cacheSeconds = 0
): Promise<NextResponse | null> {
  const safePluginName = sanitizePluginName(pluginName);
  const safeFileRelative = sanitizeRelativePublicPath(fileRelative);
  if (!safePluginName || !safeFileRelative) {
    return null;
  }
  const pluginFile = path.join(ROOT_DIR, "plugins", safePluginName, folder, safeFileRelative);
  if (!(await fileExists(pluginFile))) {
    return null;
  }
  const buffer = await readFile(pluginFile);
  const type = mime.lookup(pluginFile) || "application/octet-stream";
  return buildFileResponse(buffer, String(type), cacheSeconds);
}

function toObjectPayload(source: unknown): AnyObject {
  if (typeof source !== "object" || source === null || Array.isArray(source)) {
    return {};
  }
  return source as AnyObject;
}


type MsnWeatherLocation = {
  id: string;
  name: string;
  city: string;
  state: string;
  country: string;
  latitude: number;
  longitude: number;
  source: string;
  isAutoDetected: boolean;
};

const MSN_LOCATION_ENDPOINT =
  "https://assets.msn.cn/service/v1/news/users/me/locations";
const MSN_OVERVIEW_ENDPOINT =
  "https://api.msn.cn/weatherfalcon/weather/overview";

const MSN_LOCATION_PARAMS: Record<string, string> = {
  apikey: "0QfOX3Vn51YCzitbLaRkTTBadtWpgTN8NZLW0C1SEM",
  activityId: "B4437AEA-75EC-4737-B74F-C5A7D7302A48",
  ocid: "pdp-peregrine",
  cm: "zh-cn",
  user: "m-17520DA586CB6D4239CA1F8582CB6C5A",
  autodetect: "true"
};

const MSN_OVERVIEW_PARAMS: Record<string, string> = {
  apikey: "j5i4gDqHL6nGYwx5wi5kRhXjtf2c5qgFX9fzfk0TOo",
  activityId: "B4437AEA-75EC-4737-B74F-C5A7D7302A48",
  ocid: "msftweather",
  cm: "zh-cn",
  user: "m-17520DA586CB6D4239CA1F8582CB6C5A",
  units: "C",
  appId: "9e21380c-ff19-4c78-b4ea-19558e93a5d3",
  wrapodata: "false",
  includemapsmetadata: "true",
  nowcastingv2: "true",
  usemscloudcover: "true",
  cuthour: "true",
  getCmaAlert: "true",
  regioncategories: "alert,content",
  feature: "lifeday",
  includenowcasting: "true",
  nowcastingapi: "2",
  lifeDays: "2",
  lifeModes: "50",
  distanceinkm: "0",
  regionDataCount: "20",
  orderby: "distance",
  days: "10",
  pageOcid: "prime-weather::weathertoday-peregrine",
  source: "weather_csr",
  region: "cn",
  market: "zh-cn",
  locale: "zh-cn"
};

const MSN_FALLBACK_LOCATION: MsnWeatherLocation = {
  id: "39.910000,116.410000",
  name: "北京",
  city: "北京",
  state: "北京",
  country: "中国",
  latitude: 39.91,
  longitude: 116.41,
  source: "fallback",
  isAutoDetected: false
};

function normalizeMsnIconUrl(urlValue: unknown): string {
  const raw = toStringValue(urlValue, "").trim();
  if (!raw) {
    return "";
  }
  if (raw.startsWith("//")) {
    return `https:${raw}`;
  }
  if (raw.startsWith("http://")) {
    return `https://${raw.slice("http://".length)}`;
  }
  return raw;
}

function normalizeWeatherCoords(
  first: number,
  second: number
): { latitude: number; longitude: number } | null {
  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    return null;
  }

  if (Math.abs(first) <= 90 && Math.abs(second) <= 180) {
    return { latitude: first, longitude: second };
  }

  if (Math.abs(first) <= 180 && Math.abs(second) <= 90) {
    return { latitude: second, longitude: first };
  }

  return null;
}

function parseCoordinateText(text: string): { latitude: number; longitude: number } | null {
  const normalized = text
    .trim()
    .replace(/[，\s]+/g, ",")
    .replace(/,+/g, ",");

  if (!normalized) {
    return null;
  }

  const parts = normalized.split(",");
  if (parts.length !== 2) {
    return null;
  }

  const first = parseNumber(parts[0], Number.NaN);
  const second = parseNumber(parts[1], Number.NaN);
  return normalizeWeatherCoords(first, second);
}

function formatMsnLocationName(city: string, state: string, country: string): string {
  if (city) {
    return city;
  }
  if (state) {
    return state;
  }
  if (country) {
    return country;
  }
  return "";
}

function normalizeMsnLocation(raw: AnyObject): MsnWeatherLocation | null {
  const latitude = parseNumber(raw.latitude, Number.NaN);
  const longitude = parseNumber(raw.longitude, Number.NaN);
  const coords = normalizeWeatherCoords(latitude, longitude);
  if (!coords) {
    return null;
  }

  const city = toStringValue(raw.city, "").trim();
  const state = toStringValue(raw.state, "").trim();
  const country = toStringValue(raw.country, "").trim();
  const name = formatMsnLocationName(city, state, country);

  return {
    id: `${coords.latitude.toFixed(6)},${coords.longitude.toFixed(6)}`,
    name: name || `${coords.latitude.toFixed(4)},${coords.longitude.toFixed(4)}`,
    city,
    state,
    country,
    latitude: coords.latitude,
    longitude: coords.longitude,
    source: toStringValue(raw.locationSource, "").trim(),
    isAutoDetected: Boolean(raw.isAutoDetected)
  };
}

async function fetchMsnAutoLocation(ctx: LegacyContext): Promise<MsnWeatherLocation | null> {
  const cacheKey = `weather:msn:location:${getRealIp(ctx.request)}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && typeof cached === "object") {
    return cached as MsnWeatherLocation;
  }

  try {
    const url = new URL(MSN_LOCATION_ENDPOINT);
    for (const [key, value] of Object.entries(MSN_LOCATION_PARAMS)) {
      url.searchParams.set(key, value);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const list = toArray<AnyObject>(payload);
    const location = normalizeMsnLocation(list[0] ?? {});
    if (!location) {
      return null;
    }

    memoryCache.set(cacheKey, location, 300);
    return location;
  } catch {
    return null;
  }
}

function pickRequestWeatherCoords(ctx: LegacyContext): { latitude: number; longitude: number } | null {
  const lat = parseNumber(deepGet(ctx.requestData.all, "lat", Number.NaN), Number.NaN);
  const lon = parseNumber(deepGet(ctx.requestData.all, "lon", Number.NaN), Number.NaN);
  const direct = normalizeWeatherCoords(lat, lon);
  if (direct) {
    return direct;
  }

  const candidates = [
    toStringValue(deepGet(ctx.requestData.all, "location", ""), "").trim(),
    toStringValue(deepGet(ctx.requestData.all, "cityId", ""), "").trim(),
    toStringValue(deepGet(ctx.requestData.all, "city", ""), "").trim()
  ];

  for (const value of candidates) {
    const parsed = parseCoordinateText(value);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

async function resolveMsnWeatherLocation(ctx: LegacyContext): Promise<MsnWeatherLocation> {
  const picked = pickRequestWeatherCoords(ctx);
  if (picked) {
    const customName = toStringValue(deepGet(ctx.requestData.all, "name", ""), "").trim();
    const customCity = toStringValue(deepGet(ctx.requestData.all, "city", ""), "").trim();
    const display = customName || customCity || `${picked.latitude.toFixed(4)},${picked.longitude.toFixed(4)}`;
    return {
      id: `${picked.latitude.toFixed(6)},${picked.longitude.toFixed(6)}`,
      name: display,
      city: customCity,
      state: "",
      country: "",
      latitude: picked.latitude,
      longitude: picked.longitude,
      source: "manual",
      isAutoDetected: false
    };
  }

  const autoLocation = await fetchMsnAutoLocation(ctx);
  return autoLocation ?? MSN_FALLBACK_LOCATION;
}

async function fetchMsnOverview(location: MsnWeatherLocation): Promise<AnyObject | null> {
  const cacheKey = `weather:msn:overview:${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && typeof cached === "object") {
    return cached as AnyObject;
  }

  try {
    const url = new URL(MSN_OVERVIEW_ENDPOINT);
    for (const [key, value] of Object.entries(MSN_OVERVIEW_PARAMS)) {
      url.searchParams.set(key, value);
    }
    url.searchParams.set("lat", String(location.latitude));
    url.searchParams.set("lon", String(location.longitude));

    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      return null;
    }

    const result = payload as AnyObject;
    memoryCache.set(cacheKey, result, 180);
    return result;
  } catch {
    return null;
  }
}

function pickMsnWeatherRoot(overview: AnyObject): AnyObject {
  const responses = toArray<AnyObject>(overview.responses);
  const firstResponse = toObjectPayload(responses[0]);
  const weatherList = toArray<AnyObject>(firstResponse.weather);
  return toObjectPayload(weatherList[0]);
}

function mapMsnNowResponse(location: MsnWeatherLocation, overview: AnyObject): AnyObject {
  const weatherRoot = pickMsnWeatherRoot(overview);
  const current = toObjectPayload(weatherRoot.current);
  const tempValue = parseNumber(current.temp, Number.NaN);
  const humidityValue = parseNumber(current.rh, Number.NaN);
  const windSpeed = parseNumber(current.windSpd, Number.NaN);

  const windDirection = toStringValue(current.pvdrWindDir, "").trim();
  const windScale = toStringValue(current.pvdrWindSpd, "").trim();
  const wind = [windDirection, windScale || (Number.isFinite(windSpeed) ? `${Math.round(windSpeed)}km/h` : "")]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    city: location.city || location.name,
    temp: Number.isFinite(tempValue) ? String(Math.round(tempValue)) : toStringValue(current.temp, ""),
    weather: toStringValue(current.cap, toStringValue(current.pvdrCap, "")),
    wind,
    humidity: Number.isFinite(humidityValue)
      ? `${Math.round(humidityValue)}%`
      : toStringValue(current.rh, ""),
    time: toStringValue(current.created, ""),
    icon: normalizeMsnIconUrl(current.urlIcon),
    aqi: toStringValue(current.aqi, ""),
    aqiText: toStringValue(current.aqiSeverity, ""),
    latitude: location.latitude,
    longitude: location.longitude
  };
}

function mapMsnForecastResponse(location: MsnWeatherLocation, overview: AnyObject): AnyObject {
  const weatherRoot = pickMsnWeatherRoot(overview);
  const forecast = toObjectPayload(weatherRoot.forecast);
  const days = toArray<AnyObject>(forecast.days);

  const mappedDays = days.slice(0, 7).map((entry) => {
    const daily = toObjectPayload(entry.daily);
    const dayPart = toObjectPayload(daily.day);
    const nightPart = toObjectPayload(daily.night);

    const icon =
      normalizeMsnIconUrl(daily.iconUrl) ||
      normalizeMsnIconUrl(dayPart.urlIcon) ||
      normalizeMsnIconUrl(nightPart.urlIcon);

    const weather =
      toStringValue(dayPart.cap, "") ||
      toStringValue(daily.pvdrCap, "") ||
      toStringValue(nightPart.cap, "");

    return {
      date: toStringValue(daily.valid, ""),
      weather,
      temp1: toStringValue(daily.tempHi, ""),
      temp2: toStringValue(daily.tempLo, ""),
      icon
    };
  });

  const first = mappedDays[0] ?? {
    date: "",
    weather: "",
    temp1: "",
    temp2: "",
    icon: ""
  };

  return {
    city: location.city || location.name,
    weather: first.weather,
    temp1: first.temp1,
    temp2: first.temp2,
    ptime: first.date,
    icon: first.icon,
    days: mappedDays,
    latitude: location.latitude,
    longitude: location.longitude
  };
}

async function handleMsnWeatherPluginApi(
  ctx: LegacyContext,
  method: string
): Promise<NextResponse> {
  if (method === "search") {
    const city = toStringValue(deepGet(ctx.requestData.all, "city", ""), "").trim();
    if (!city) {
      return jsonSuccess("ok", []);
    }

    const coords = parseCoordinateText(city);
    if (!coords) {
      return jsonSuccess("ok", []);
    }

    const item = {
      id: `${coords.latitude.toFixed(6)},${coords.longitude.toFixed(6)}`,
      name: `${coords.latitude.toFixed(4)},${coords.longitude.toFixed(4)}`,
      latitude: coords.latitude,
      longitude: coords.longitude
    };
    return jsonSuccess("ok", [item]);
  }

  if (method === "location" || method === "ip") {
    const location = (await fetchMsnAutoLocation(ctx)) ?? MSN_FALLBACK_LOCATION;
    return jsonSuccess("ok", location);
  }

  if (method !== "now" && method !== "forecast") {
    return jsonError("not action");
  }

  const location = await resolveMsnWeatherLocation(ctx);
  const overview = await fetchMsnOverview(location);
  if (!overview) {
    return jsonError("数据获取错误");
  }

  if (method === "now") {
    return jsonSuccess("ok", mapMsnNowResponse(location, overview));
  }

  return jsonSuccess("ok", mapMsnForecastResponse(location, overview));
}
async function mapWeatherNowResponse(ctx: LegacyContext): Promise<NextResponse> {
  const response = await handleAppsWeatherController(ctx, "now");
  const payload = toObjectPayload(await response.json());
  if (parseNumber(payload.code, 0) !== 1) {
    return NextResponse.json(payload);
  }
  const now = toObjectPayload(payload.data);
  const windDir = toStringValue(now.windDir, "");
  const windScale = toStringValue(now.windScale, "");
  const windSpeed = toStringValue(now.windSpeed, "");
  return jsonSuccess("ok", {
    city: "",
    temp: toStringValue(now.temp, ""),
    weather: toStringValue(now.text, ""),
    wind: [windDir, windScale, windSpeed].filter(Boolean).join(" ").trim(),
    humidity: toStringValue(now.humidity, ""),
    time: toStringValue(now.obsTime, "")
  });
}

async function mapWeatherForecastResponse(ctx: LegacyContext): Promise<NextResponse> {
  const response = await handleAppsWeatherController(ctx, "everyday");
  const payload = toObjectPayload(await response.json());
  if (parseNumber(payload.code, 0) !== 1) {
    return NextResponse.json(payload);
  }
  const list = toArray<AnyObject>(payload.data);
  const first = list[0] ?? {};
  return jsonSuccess("ok", {
    city: "",
    weather: toStringValue(first.textDay, ""),
    temp1: toStringValue(first.tempMax, ""),
    temp2: toStringValue(first.tempMin, ""),
    ptime: toStringValue(first.fxDate, "")
  });
}

async function handlePluginApi(
  ctx: LegacyContext,
  pluginName: string,
  action: string
): Promise<NextResponse> {
  const plugin = pluginName.toLowerCase();
  const method = action.toLowerCase();

  if (plugin === "topsearch") {
    if (method === "list") {
      const type = toStringValue(deepGet(ctx.requestData.query, "type", "baidu"), "baidu");
      return handleAppsTopSearchController(ctx, type);
    }
    return jsonError("not action");
  }

  if (plugin === "weather") {
    return handleMsnWeatherPluginApi(ctx, method);
  }

  return jsonError("not action");
}

async function handlePluginsPath(ctx: LegacyContext): Promise<NextResponse> {

  const segments = ctx.pathSegments;
  if (segments.length < 3) {
    return renderCardNotFoundHtml();
  }

  const pluginName = sanitizePluginName(segments[1]);
  if (!pluginName) {
    return renderCardNotFoundHtml();
  }

  const route = segments[2].toLowerCase();

  if (route === "api" && segments.length >= 4) {
    return handlePluginApi(ctx, pluginName, segments[3]);
  }

  if (route === "static" && segments.length >= 4) {
    const response = await servePluginFile(
      pluginName,
      "static",
      segments.slice(3).join("/"),
      60 * 60 * 24 * 7
    );
    if (response) {
      return response;
    }
    return renderCardNotFoundHtml();
  }

  if (route === "view" && segments.length >= 4) {
    const response = await servePluginFile(pluginName, "view", segments.slice(3).join("/"), 60 * 5);
    if (response) {
      return response;
    }
    return renderCardNotFoundHtml();
  }

  if (segments.length === 3) {
    const viewMap: Record<string, string> = {
      card: "card.html",
      window: "window.html",
      setting: "setting.html"
    };
    const fileName = viewMap[route];
    if (fileName) {
      const response = await servePluginFile(pluginName, "view", fileName, 60 * 5);
      if (response) {
        return response;
      }
    }
  }

  return renderCardNotFoundHtml();

}



function parseLegacyController(pathSegments: string[]): {

  controller: string;

  action: string;

} | null {

  if (pathSegments.length < 2) {

    return null;

  }

  const [first, second] = pathSegments;

  if (first.includes(".")) {

    return {

      controller: first,

      action: second

    };

  }

  return {

    controller: first,

    action: second

  };

}



export async function handleLegacyRequest(

  request: NextRequest,

  pathSegments: string[]

): Promise<NextResponse> {

  try {

    const ctx = await createContext(request, pathSegments);

    if (request.method.toUpperCase() === "OPTIONS") {

      return withCors(new NextResponse("", { status: 200 }));

    }



    if (shouldRenderIndex(pathSegments)) {

      return withCors(await renderIndexHtml(ctx));

    }



    if (pathSegments.length === 1 && pathSegments[0].toLowerCase() === "privacy") {

      return withCors(await renderPrivacyHtml(ctx));

    }

    if (pathSegments.length === 1 && pathSegments[0].toLowerCase() === "privacy.html") {

      return withCors(await renderPrivacyHtml(ctx));

    }

    if (pathSegments.length === 1 && pathSegments[0].toLowerCase() === "manifest.json") {

      return withCors(await handleIndexController(ctx, "manifest"));

    }

    if (pathSegments.length === 1 && pathSegments[0].toLowerCase() === "favicon") {

      return withCors(await handleIndexController(ctx, "favicon"));

    }

    if (pathSegments.length === 1 && pathSegments[0].toLowerCase() === "qq_login") {

      return withCors(await handleUserController(ctx, "qq_login"));

    }
    if (pathSegments.length === 1 && pathSegments[0].toLowerCase() === "wx_login") {

      return withCors(await handleUserController(ctx, "wx_login"));

    }


    if (pathSegments.length > 0 && pathSegments[0].toLowerCase() === "plugins") {

      return withCors(await handlePluginsPath(ctx));

    }



    
    if (pathSegments.length === 2 && pathSegments[0].toLowerCase() === "ai" && pathSegments[1].toLowerCase() === "msg") {
      return withCors(await handleAiStream(ctx));
    }

const legacy = parseLegacyController(pathSegments);

    if (legacy) {

      return withCors(await dispatchController(ctx, legacy.controller, legacy.action));

    }



    return withCors(jsonError(`Endpoint not found: /${pathSegments.join("/")}`));

  } catch (error) {

    if (error instanceof JsonError) {

      return withCors(NextResponse.json(error.payload, { status: error.status }));

    }

    const message = error instanceof Error ? error.message : "Server Error";

    return withCors(NextResponse.json(errorPayload(message), { status: 500 }));

  }

}
