import { Redis } from "@upstash/redis";
import type { CacheDriver } from "./driver";

export class UpstashCacheDriver implements CacheDriver {
  private readonly client: Redis;

  constructor(url: string, token: string) {
    this.client = new Redis({ url, token });
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    const value = await this.client.get<T>(key);
    return value ?? null;
  }

  async set<T = unknown>(key: string, value: T, ttlSeconds = 300): Promise<void> {
    await this.client.set(key, value as unknown as string | number | object, { ex: ttlSeconds });
  }

  async delete(key: string): Promise<void> {
    await this.client.del(key);
  }

  async incr(key: string, ttlSeconds = 60): Promise<number> {
    const next = await this.client.incr(key);
    if (next === 1) {
      await this.client.expire(key, ttlSeconds);
    }
    return next;
  }

  async ping(): Promise<boolean> {
    const reply = await this.client.ping();
    return reply === "PONG";
  }
}
