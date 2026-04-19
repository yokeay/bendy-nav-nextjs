import { TtlCache } from "./ttl-cache";
import type { CacheDriver } from "./driver";

type Entry = { value: unknown; expiresAt: number };

export class MemoryCacheDriver implements CacheDriver {
  private readonly store = new TtlCache<unknown>();
  private readonly counters = new Map<string, Entry>();

  async get<T = unknown>(key: string): Promise<T | null> {
    return (this.store.get(key) as T | null) ?? null;
  }

  async set<T = unknown>(key: string, value: T, ttlSeconds = 300): Promise<void> {
    this.store.set(key, value, ttlSeconds);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
    this.counters.delete(key);
  }

  async incr(key: string, ttlSeconds = 60): Promise<number> {
    const now = Date.now();
    const existing = this.counters.get(key);
    if (!existing || existing.expiresAt <= now) {
      this.counters.set(key, { value: 1, expiresAt: now + ttlSeconds * 1000 });
      return 1;
    }
    existing.value = (existing.value as number) + 1;
    return existing.value as number;
  }

  async ping(): Promise<boolean> {
    return true;
  }
}
