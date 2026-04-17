import { getCache, cacheKey } from "@/server/infrastructure/cache";

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
}

export async function rateLimit(
  bucket: string,
  identifier: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const key = cacheKey("rl", bucket, identifier);
  const count = await getCache().incr(key, windowSeconds);
  return { allowed: count <= limit, count, limit };
}
