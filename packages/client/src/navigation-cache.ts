export interface DotReactNavigationCacheOptions {
  /** Maximum number of route payloads retained in one browser tab. */
  readonly maxEntries?: number;
  /** Absolute freshness window for prefetched and visited payloads. */
  readonly staleTimeMs?: number;
}

interface CacheEntry<Value> {
  readonly value: Value;
  readonly expiresAt: number;
}

/** Bounded absolute-TTL LRU used by the client router. */
export class DotReactNavigationCache<Key, Value> {
  readonly #entries = new Map<Key, CacheEntry<Value>>();
  readonly #maxEntries: number;
  readonly #staleTimeMs: number;
  readonly #now: () => number;

  constructor(
    options: DotReactNavigationCacheOptions = {},
    now: () => number = Date.now
  ) {
    this.#maxEntries = options.maxEntries ?? 32;
    this.#staleTimeMs = options.staleTimeMs ?? 30_000;
    if (!Number.isSafeInteger(this.#maxEntries) || this.#maxEntries < 1 || this.#maxEntries > 256)
      throw new RangeError("DotReact navigation maxEntries must be an integer between 1 and 256.");
    if (!Number.isSafeInteger(this.#staleTimeMs) || this.#staleTimeMs < 0 || this.#staleTimeMs > 3_600_000)
      throw new RangeError("DotReact navigation staleTimeMs must be an integer between 0 and 3600000.");
    this.#now = now;
  }

  get(key: Key): Value | undefined {
    const entry = this.#entries.get(key);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= this.#now()) {
      this.#entries.delete(key);
      return undefined;
    }
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key: Key, value: Value, staleTimeMs: number = this.#staleTimeMs): void {
    if (!Number.isSafeInteger(staleTimeMs) || staleTimeMs < 0 || staleTimeMs > 3_600_000)
      throw new RangeError("DotReact navigation staleTimeMs must be an integer between 0 and 3600000.");
    this.#entries.delete(key);
    if (staleTimeMs === 0) return;
    while (this.#entries.size >= this.#maxEntries) {
      const oldest = this.#entries.keys().next().value as Key | undefined;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
    this.#entries.set(key, { value, expiresAt: this.#now() + staleTimeMs });
  }

  delete(key: Key): boolean {
    return this.#entries.delete(key);
  }

  get size(): number {
    return this.#entries.size;
  }
}
