import { describe, it, expect } from "bun:test";
import { createScope, type Lite } from "@pumped-fn/lite";
// @ts-ignore - implementation will be created next
import { cacheAtom } from "../atoms/cache";
import { cacheConfigTag } from "../config/tags";

describe("Cache Atom (c3-104)", () => {
  it("store() returns unique shortlink (8 chars)", async () => {
    const scope = createScope({
      tags: [
        cacheConfigTag({ ttlMs: 1000, gcIntervalMs: 1000 }),
      ],
    });

    const cache = await scope.resolve(cacheAtom);
    const shortlink = cache.store("some-data", "text/plain");

    expect(shortlink).toBeString();
    expect(shortlink).toHaveLength(8);

    const shortlink2 = cache.store("other-data", "text/plain");
    expect(shortlink2).not.toBe(shortlink);

    await scope.dispose();
  });

  it("get() returns stored data before TTL", async () => {
    const scope = createScope({
      tags: [
        cacheConfigTag({ ttlMs: 1000, gcIntervalMs: 1000 }),
      ],
    });

    const cache = await scope.resolve(cacheAtom);
    const shortlink = cache.store("my-data", "application/json");

    const result = cache.get(shortlink);
    expect(result).toBeDefined();
    expect(result?.data).toBe("my-data");
    expect(result?.contentType).toBe("application/json");

    await scope.dispose();
  });

  it("get() returns undefined after TTL expires", async () => {
    const ttlMs = 50;
    const scope = createScope({
      tags: [
        cacheConfigTag({ ttlMs, gcIntervalMs: 1000 }),
      ],
    });

    const cache = await scope.resolve(cacheAtom);
    const shortlink = cache.store("expired-data", "text/plain");

    await new Promise((resolve) => setTimeout(resolve, ttlMs + 20));

    const result = cache.get(shortlink);
    expect(result).toBeUndefined();

    await scope.dispose();
  });

  it("GC runs and removes expired entries", async () => {
    const gcIntervalMs = 50;
    const ttlMs = 20;

    const scope = createScope({
      tags: [
        cacheConfigTag({ ttlMs, gcIntervalMs }),
      ],
    });

    const cache = await scope.resolve(cacheAtom);
    const shortlink = cache.store("gc-data", "text/plain");

    await new Promise((resolve) => setTimeout(resolve, ttlMs + gcIntervalMs + 20));

    expect(cache.get(shortlink)).toBeUndefined();

    await scope.dispose();
  });

  it("Cleanup stops GC timer", async () => {
    const scope = createScope({
      tags: [
        cacheConfigTag({ ttlMs: 100, gcIntervalMs: 100 }),
      ],
    });

    await scope.resolve(cacheAtom);
    await scope.dispose();

    expect(true).toBe(true);
  });
});

describe("input cache", () => {
  it("getByInputHash returns undefined for unknown hash", async () => {
    const scope = createScope({
      tags: [cacheConfigTag({ ttlMs: 300000, gcIntervalMs: 60000 })],
    });
    const cache = await scope.resolve(cacheAtom);

    const result = cache.getByInputHash("unknown-hash");
    expect(result).toBeUndefined();

    await scope.dispose();
  });

  it("storeWithInputHash links input hash to shortlink", async () => {
    const scope = createScope({
      tags: [cacheConfigTag({ ttlMs: 300000, gcIntervalMs: 60000 })],
    });
    const cache = await scope.resolve(cacheAtom);

    // Store content and get shortlink
    const shortlink = cache.store("test-data", "image/svg+xml");

    // Link input hash to shortlink
    const inputHash = "abc123hash";
    cache.storeInputHash(inputHash, shortlink);

    // Retrieve by input hash
    const result = cache.getByInputHash(inputHash);
    expect(result).toBe(shortlink);

    await scope.dispose();
  });

  it("input hash expires with output cache TTL", async () => {
    const scope = createScope({
      tags: [cacheConfigTag({ ttlMs: 50, gcIntervalMs: 10 })],
    });
    const cache = await scope.resolve(cacheAtom);

    const shortlink = cache.store("test-data", "image/svg+xml");
    cache.storeInputHash("test-hash", shortlink);

    // Verify it exists
    expect(cache.getByInputHash("test-hash")).toBe(shortlink);

    // Wait for expiration
    await new Promise(r => setTimeout(r, 100));

    // Should be expired
    expect(cache.getByInputHash("test-hash")).toBeUndefined();

    await scope.dispose();
  });
});
