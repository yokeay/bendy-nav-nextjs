import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit } from "../src/server/auth/rate-limit";

beforeEach(() => {
  process.env.CACHE_DRIVER = "memory";
  process.env.BUSINESS_PREFIX = "bendy";
});

describe("rateLimit", () => {
  it("allows up to limit, blocks beyond", async () => {
    const bucket = "test:allow";
    const id = `id-${Math.random()}`;
    const a = await rateLimit(bucket, id, 3, 60);
    const b = await rateLimit(bucket, id, 3, 60);
    const c = await rateLimit(bucket, id, 3, 60);
    const d = await rateLimit(bucket, id, 3, 60);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    expect(c.allowed).toBe(true);
    expect(d.allowed).toBe(false);
    expect(d.count).toBe(4);
  });

  it("isolates buckets and identifiers", async () => {
    const x = await rateLimit("bucketX", "id1", 2, 60);
    const y = await rateLimit("bucketY", "id1", 2, 60);
    const z = await rateLimit("bucketX", "id2", 2, 60);
    expect(x.count).toBe(1);
    expect(y.count).toBe(1);
    expect(z.count).toBe(1);
  });
});
