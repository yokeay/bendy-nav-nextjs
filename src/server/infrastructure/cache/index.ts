import type { CacheDriver, CacheDriverKind } from "./driver";
import { MemoryCacheDriver } from "./memory";
import { UpstashCacheDriver } from "./upstash";

let instance: CacheDriver | undefined;

function resolveKind(): CacheDriverKind {
  const raw = (process.env.CACHE_DRIVER ?? "memory").toLowerCase();
  return raw === "upstash" ? "upstash" : "memory";
}

function createDriver(): CacheDriver {
  const kind = resolveKind();
  if (kind === "upstash") {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      console.warn("[cache] CACHE_DRIVER=upstash but UPSTASH_REDIS_REST_URL/TOKEN not set; falling back to memory.");
      return new MemoryCacheDriver();
    }
    return new UpstashCacheDriver(url, token);
  }
  return new MemoryCacheDriver();
}

export function getCache(): CacheDriver {
  if (!instance) {
    instance = createDriver();
  }
  return instance;
}

export function cacheKey(...parts: (string | number)[]): string {
  const prefix = process.env.BUSINESS_PREFIX ?? "bendy";
  return [prefix, ...parts].join(":");
}

export type { CacheDriver } from "./driver";
