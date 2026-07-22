import { performance } from "node:perf_hooks";

export interface BenchmarkOptions {
  url: string;
  requests: number;
  concurrency: number;
  warmup: number;
  timeoutMs: number;
  /** Reject unexpectedly large benchmark responses instead of buffering without a bound. */
  maxResponseBytes?: number;
}

export interface BenchmarkResult {
  requests: number;
  failures: number;
  durationMs: number;
  requestsPerSecond: number;
  receivedBytes: number;
  megabytesPerSecond: number;
  meanMs: number;
  ttfbP50Ms: number;
  ttfbP95Ms: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  failureRate: number;
}

export interface BenchmarkComparison {
  candidate: { url: string; result: BenchmarkResult };
  baseline: { url: string; result: BenchmarkResult };
  p95Ratio: number;
  throughputRatio: number;
}

export interface BenchmarkAggregate extends BenchmarkResult {
  rounds: number;
  throughputIqr: number;
  p95IqrMs: number;
  samples: readonly BenchmarkResult[];
}

export interface BenchmarkThresholds {
  maxP95Ratio?: number;
  minThroughputRatio?: number;
  maxFailureRate?: number;
}

type Fetcher = (url: string, init: RequestInit) => Promise<{
  ok: boolean;
  arrayBuffer?: () => Promise<ArrayBuffer>;
}>;

export async function benchmarkUrl(options: BenchmarkOptions, fetcher: Fetcher = fetch): Promise<BenchmarkResult> {
  validate(options);
  const maxResponseBytes = options.maxResponseBytes ?? 5 * 1024 * 1024;
  let warmupCursor = 0;
  await Promise.all(Array.from({ length: Math.min(options.concurrency, options.warmup) }, async () => {
    while (warmupCursor++ < options.warmup) {
      const response = await fetcher(options.url, {
        signal: AbortSignal.timeout(options.timeoutMs), redirect: "manual"
      });
      await readBoundedBody(response, maxResponseBytes);
      if (!response.ok) throw new Error("Benchmark warmup received a non-success response.");
    }
  }));

  const samples: number[] = [];
  const ttfbSamples: number[] = [];
  let failures = 0;
  let receivedBytes = 0;
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
        ttfbSamples.push(performance.now() - requestStarted);
        const bodyBytes = await readBoundedBody(response, maxResponseBytes);
        receivedBytes += bodyBytes;
        if (!response.ok) failures++;
      } catch { failures++; }
      samples.push(performance.now() - requestStarted);
    }
  });
  await Promise.all(workers);
  const durationMs = performance.now() - started;
  samples.sort((left, right) => left - right);
  ttfbSamples.sort((left, right) => left - right);
  return {
    requests: options.requests,
    failures,
    durationMs,
    requestsPerSecond: options.requests / (durationMs / 1000),
    receivedBytes,
    megabytesPerSecond: (receivedBytes / 1_048_576) / (durationMs / 1000),
    meanMs: samples.reduce((total, sample) => total + sample, 0) / samples.length,
    ttfbP50Ms: percentile(ttfbSamples, 0.50),
    ttfbP95Ms: percentile(ttfbSamples, 0.95),
    p50Ms: percentile(samples, 0.50),
    p95Ms: percentile(samples, 0.95),
    p99Ms: percentile(samples, 0.99),
    failureRate: failures / options.requests
  };
}

/** Aggregates every metric independently so one unusually favorable round cannot represent the run. */
export function aggregateBenchmarkSamples(samples: readonly BenchmarkResult[]): BenchmarkAggregate {
  if (samples.length === 0) throw new Error("At least one benchmark sample is required.");
  const median = (select: (sample: BenchmarkResult) => number): number =>
    percentile(samples.map(select).sort((left, right) => left - right), 0.5);
  const iqr = (select: (sample: BenchmarkResult) => number): number => {
    const values = samples.map(select).sort((left, right) => left - right);
    return percentile(values, 0.75) - percentile(values, 0.25);
  };
  return {
    requests: Math.round(median(sample => sample.requests)),
    failures: Math.round(median(sample => sample.failures)),
    durationMs: median(sample => sample.durationMs),
    requestsPerSecond: median(sample => sample.requestsPerSecond),
    receivedBytes: Math.round(median(sample => sample.receivedBytes)),
    megabytesPerSecond: median(sample => sample.megabytesPerSecond),
    meanMs: median(sample => sample.meanMs),
    ttfbP50Ms: median(sample => sample.ttfbP50Ms),
    ttfbP95Ms: median(sample => sample.ttfbP95Ms),
    p50Ms: median(sample => sample.p50Ms),
    p95Ms: median(sample => sample.p95Ms),
    p99Ms: median(sample => sample.p99Ms),
    failureRate: median(sample => sample.failureRate),
    rounds: samples.length,
    throughputIqr: iqr(sample => sample.requestsPerSecond),
    p95IqrMs: iqr(sample => sample.p95Ms),
    samples: [...samples]
  };
}

export function compareBenchmarkResults(
  candidateUrl: string,
  candidate: BenchmarkResult,
  baselineUrl: string,
  baseline: BenchmarkResult
): BenchmarkComparison {
  return {
    candidate: { url: candidateUrl, result: candidate },
    baseline: { url: baselineUrl, result: baseline },
    p95Ratio: safeRatio(candidate.p95Ms, baseline.p95Ms),
    throughputRatio: safeRatio(candidate.requestsPerSecond, baseline.requestsPerSecond)
  };
}

export function evaluateBenchmarkThresholds(
  comparison: BenchmarkComparison,
  thresholds: BenchmarkThresholds
): string[] {
  const failures: string[] = [];
  if (thresholds.maxP95Ratio !== undefined && comparison.p95Ratio > thresholds.maxP95Ratio)
    failures.push(`candidate p95 ratio ${comparison.p95Ratio.toFixed(3)} exceeds ${thresholds.maxP95Ratio.toFixed(3)}`);
  if (thresholds.minThroughputRatio !== undefined && comparison.throughputRatio < thresholds.minThroughputRatio)
    failures.push(`candidate throughput ratio ${comparison.throughputRatio.toFixed(3)} is below ${thresholds.minThroughputRatio.toFixed(3)}`);
  if (thresholds.maxFailureRate !== undefined && comparison.candidate.result.failureRate > thresholds.maxFailureRate)
    failures.push(`candidate failure rate ${(comparison.candidate.result.failureRate * 100).toFixed(2)}% exceeds ${(thresholds.maxFailureRate * 100).toFixed(2)}%`);
  return failures;
}

export function formatBenchmark(result: BenchmarkResult, label = "DotReact SSR benchmark"): string {
  return [
    label,
    `  requests: ${result.requests} (${result.failures} failures, ${(result.failureRate * 100).toFixed(2)}%)`,
    `  throughput: ${result.requestsPerSecond.toFixed(1)} req/s`,
    `  transfer: ${(result.receivedBytes / 1024).toFixed(1)} KiB · ${result.megabytesPerSecond.toFixed(2)} MiB/s`,
    `  TTFB: p50 ${result.ttfbP50Ms.toFixed(1)} ms / p95 ${result.ttfbP95Ms.toFixed(1)} ms`,
    `  latency: mean ${result.meanMs.toFixed(1)} ms / p50 ${result.p50Ms.toFixed(1)} ms / p95 ${result.p95Ms.toFixed(1)} ms / p99 ${result.p99Ms.toFixed(1)} ms`,
    `  elapsed: ${result.durationMs.toFixed(1)} ms`
  ].join("\n");
}

export function formatBenchmarkComparison(comparison: BenchmarkComparison): string {
  return [
    formatBenchmark(comparison.candidate.result, `Candidate · ${comparison.candidate.url}`),
    "",
    formatBenchmark(comparison.baseline.result, `Baseline · ${comparison.baseline.url}`),
    "",
    "Comparison (candidate / baseline)",
    `  p95 ratio: ${comparison.p95Ratio.toFixed(3)}x (${formatPercentDelta(comparison.p95Ratio)})`,
    `  throughput ratio: ${comparison.throughputRatio.toFixed(3)}x (${formatPercentDelta(comparison.throughputRatio)})`
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
  if (options.maxResponseBytes !== undefined &&
    (!Number.isSafeInteger(options.maxResponseBytes) || options.maxResponseBytes < 1 || options.maxResponseBytes > 100 * 1024 * 1024))
    throw new Error("maxResponseBytes must be an integer between 1 and 104857600.");
}

function percentile(samples: number[], value: number): number {
  if (samples.length === 0) return 0;
  return samples[Math.max(0, Math.ceil(samples.length * value) - 1)]!;
}

function safeRatio(value: number, baseline: number): number {
  if (baseline === 0) return value === 0 ? 1 : Number.POSITIVE_INFINITY;
  return value / baseline;
}

function formatPercentDelta(ratio: number): string {
  if (!Number.isFinite(ratio)) return "+infinite";
  const delta = (ratio - 1) * 100;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`;
}

async function readBoundedBody(
  response: { arrayBuffer?: () => Promise<ArrayBuffer> },
  maxResponseBytes: number
): Promise<number> {
  if (response.arrayBuffer === undefined) return 0;
  const body = await response.arrayBuffer();
  if (body.byteLength > maxResponseBytes)
    throw new Error(`Benchmark response exceeded ${maxResponseBytes} bytes.`);
  return body.byteLength;
}
