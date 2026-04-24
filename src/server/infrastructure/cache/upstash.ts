import { Redis } from "@upstash/redis";
import type { CacheDriver } from "./driver";

export class UpstashCacheDriver implements CacheDriver {
  private readonly client: Redis;

  constructor(url: string, token: string) {
    this.client = new Redis({ url, token });
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get<T>(key);
      return value ?? null;
    } catch {
      return null;
    }
  }

  async set<T = unknown>(key: string, value: T, ttlSeconds = 300): Promise<void> {
    try {
      await this.client.set(key, value as unknown as string | number | object, { ex: ttlSeconds });
    } catch {
      // network failure — operation silently dropped
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch {
      // network failure — operation silently dropped
    }
  }

  async incr(key: string, ttlSeconds = 60): Promise<number> {
    try {
      const next = await this.client.incr(key);
      if (next === 1) {
        await this.client.expire(key, ttlSeconds);
      }
      return next;
    } catch {
      return 1; // safe default — treated as first request, allowed through
    }
  }

  async ping(): Promise<boolean> {
    try {
      const reply = await this.client.ping();
      return reply === "PONG";
    } catch {
      return false;
    }
  }
}
