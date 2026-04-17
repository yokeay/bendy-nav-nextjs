export interface CacheDriver {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  delete(key: string): Promise<void>;
  incr(key: string, ttlSeconds?: number): Promise<number>;
  ping(): Promise<boolean>;
}

export type CacheDriverKind = "upstash" | "memory";
