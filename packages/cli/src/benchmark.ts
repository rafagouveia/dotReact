import { performance } from "node:perf_hooks";

export interface BenchmarkOptions {
  url: string;
  requests: number;
  concurrency: number;
  warmup: number;
  timeoutMs: number;
}

export interface BenchmarkResult {
  requests: number;
  failures: number;
  durationMs: number;
  requestsPerSecond: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}

type Fetcher = (url: string, init: RequestInit) => Promise<{ ok: boolean }>;

export async function benchmarkUrl(options: BenchmarkOptions, fetcher: Fetcher = fetch): Promise<BenchmarkResult> {
  validate(options);
  for (let index = 0; index < options.warmup; index++)
    await fetcher(options.url, { signal: AbortSignal.timeout(options.timeoutMs), redirect: "manual" });

  const samples: number[] = [];
  let failures = 0;
  let cursor = 0;
  const started = performance.now();
  const workers = Array.from({ length: Math.min(options.concurrency, options.requests) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= options.requests) return;
      const requestStarted = performance.now();
      try {
        const response = await fetcher(options.url, {
          signal: AbortSignal.timeout(options.timeoutMs),
          redirect: "manual"
        });
        if (!response.ok) failures++;
      } catch { failures++; }
      samples.push(performance.now() - requestStarted);
    }
  });
  await Promise.all(workers);
  const durationMs = performance.now() - started;
  samples.sort((left, right) => left - right);
  return {
    requests: options.requests,
    failures,
    durationMs,
    requestsPerSecond: options.requests / (durationMs / 1000),
    p50Ms: percentile(samples, 0.50),
    p95Ms: percentile(samples, 0.95),
    p99Ms: percentile(samples, 0.99)
  };
}

export function formatBenchmark(result: BenchmarkResult): string {
  return [
    "DotReact SSR benchmark",
    `  requests: ${result.requests} (${result.failures} failures)`,
    `  throughput: ${result.requestsPerSecond.toFixed(1)} req/s`,
    `  latency: p50 ${result.p50Ms.toFixed(1)} ms / p95 ${result.p95Ms.toFixed(1)} ms / p99 ${result.p99Ms.toFixed(1)} ms`,
    `  elapsed: ${result.durationMs.toFixed(1)} ms`
  ].join("\n");
}

function validate(options: BenchmarkOptions): void {
  const url = new URL(options.url);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Benchmark URL must use HTTP or HTTPS.");
  for (const [name, value, maximum] of [
    ["requests", options.requests, 10_000],
    ["concurrency", options.concurrency, 256],
    ["warmup", options.warmup, 1_000],
    ["timeout", options.timeoutMs, 300_000]
  ] as const) {
    if (!Number.isSafeInteger(value) || value < (name === "warmup" ? 0 : 1) || value > maximum)
      throw new Error(`${name} must be an integer between ${name === "warmup" ? 0 : 1} and ${maximum}.`);
  }
}

function percentile(samples: number[], value: number): number {
  if (samples.length === 0) return 0;
  return samples[Math.max(0, Math.ceil(samples.length * value) - 1)]!;
}
