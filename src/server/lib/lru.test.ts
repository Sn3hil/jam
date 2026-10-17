import { describe, expect, test } from "bun:test";
import { LruCache } from "./lru";
import { createSemaphore } from "./semaphore";

describe("LruCache", () => {
  test("set/get/evict LRU order", () => {
    const cache = new LruCache<string, number>(2, 60_000);
    cache.set("a", 1);
    cache.set("b", 2);
    expect(cache.get("a")).toBe(1);
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    expect(cache.get("c")).toBe(3);
    expect(cache.size).toBe(2);
  });

  test("ttl expiry", async () => {
    const cache = new LruCache<string, number>(10, 30);
    cache.set("x", 42);
    expect(cache.get("x")).toBe(42);
    await Bun.sleep(45);
    expect(cache.get("x")).toBeUndefined();
  });

  test("delete and has", () => {
    const cache = new LruCache<string, string>(5, 60_000);
    cache.set("k", "v");
    expect(cache.has("k")).toBe(true);
    cache.delete("k");
    expect(cache.has("k")).toBe(false);
    cache.delete("nonexistent");
  });
});

describe("createSemaphore", () => {
  test("limits concurrent runs and releases", async () => {
    const sem = createSemaphore(2);
    let active = 0;
    let peak = 0;
    const job = () => {
      active += 1;
      peak = Math.max(peak, active);
      return new Promise<void>((resolve) =>
        setTimeout(() => {
          active -= 1;
          resolve();
        }, 15),
      );
    };
    await Promise.all(Array.from({ length: 6 }, () => sem.run(job)));
    expect(peak).toBe(2);
  });

  test("error propagates and releases capacity", async () => {
    const sem = createSemaphore(1);
    await expect(
      sem.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const result = await sem.run(async () => "ok");
    expect(result).toBe("ok");
  });
});
