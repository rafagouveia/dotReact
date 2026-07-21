import assert from "node:assert/strict";
import test from "node:test";
import { DotReactNavigationCache } from "./navigation-cache.js";

test("navigation cache expires entries using an absolute freshness window", () => {
  let now = 1_000;
  const cache = new DotReactNavigationCache<string, number>({ staleTimeMs: 30_000 }, () => now);
  cache.set("/one", 1);

  now += 29_999;
  assert.equal(cache.get("/one"), 1);
  now += 1;
  assert.equal(cache.get("/one"), undefined);
  assert.equal(cache.size, 0);
});

test("navigation cache evicts the least recently used route", () => {
  const cache = new DotReactNavigationCache<string, number>({ maxEntries: 2, staleTimeMs: 30_000 }, () => 1);
  cache.set("/one", 1);
  cache.set("/two", 2);
  assert.equal(cache.get("/one"), 1);
  cache.set("/three", 3);

  assert.equal(cache.get("/one"), 1);
  assert.equal(cache.get("/two"), undefined);
  assert.equal(cache.get("/three"), 3);
});

test("zero stale time disables payload retention without disabling navigation", () => {
  const cache = new DotReactNavigationCache<string, number>({ staleTimeMs: 0 });
  cache.set("/dynamic", 1);
  assert.equal(cache.get("/dynamic"), undefined);
});

test("a server-directed freshness window overrides the client default", () => {
  let now = 100;
  const cache = new DotReactNavigationCache<string, number>({ staleTimeMs: 30_000 }, () => now);
  cache.set("/short", 1, 1_000);
  now += 1_000;
  assert.equal(cache.get("/short"), undefined);
});

test("navigation cache rejects unbounded settings", () => {
  assert.throws(() => new DotReactNavigationCache({ maxEntries: 0 }), /maxEntries/);
  assert.throws(() => new DotReactNavigationCache({ staleTimeMs: 3_600_001 }), /staleTimeMs/);
});
