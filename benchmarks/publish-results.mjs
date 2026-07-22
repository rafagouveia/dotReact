import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "benchmarks/results/latest.json");
const report = JSON.parse(await readFile(source, "utf8"));
if (report.schemaVersion !== 2) throw new Error("Only benchmark report schema v2 can be published.");
if (!Array.isArray(report.reports) || report.reports.length !== 4)
  throw new Error("Benchmark report is missing the four comparable baselines.");
if (report.candidateGate?.passed !== true || report.reports.some(item => item.passed !== true))
  throw new Error("A benchmark with failed correctness or regression gates cannot be published.");
if (report.options?.isolation !== "fresh-single-process-tree-per-scenario-round")
  throw new Error("A benchmark that keeps comparison servers alive cannot be published.");
const allowLocal = process.argv.includes("--allow-local");
if (!report.publishable && !allowLocal)
  throw new Error("This result is local or dirty. Use dedicated clean CI, or --allow-local for a clearly labelled engineering reference.");

const rows = [
  row("DotReact", "SSR dinâmico server-only", report.candidate),
  row("Razor Pages", "SSR dinâmico server-only", baseline("Razor Pages")),
  row("Blazor static SSR", "SSR dinâmico server-only", baseline("Blazor static SSR")),
  row("Next.js Server Component", "SSR dinâmico server-only", baseline("Next.js Server Component")),
  row("DotReact", "SSR interativo", report.interactiveCandidate),
  row("Next.js", "SSR interativo", baseline("Next.js interactive SSR"))
];
const snapshot = {
  schemaVersion: 2,
  generatedAt: report.generatedAt,
  verification: report.publishable ? "verified" : "local-reference",
  suiteRevision: report.suiteRevision,
  environment: report.environment,
  methodology: {
    requests: report.options.requests,
    concurrency: report.options.concurrency,
    warmup: report.options.warmup,
    rounds: report.options.rounds,
    aggregation: report.options.representative,
    isolation: report.options.isolation,
    compression: report.options.compression,
    workload: report.options.workload
  },
  limitations: report.limitations,
  resourceUsage: report.resourceUsage ?? null,
  rows
};
const content = `${JSON.stringify(snapshot, null, 2)}\n`;
for (const output of [
  resolve(root, "benchmarks/published/latest.json"),
  resolve(root, "docs/public/benchmarks/latest.json")
]) {
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, content);
}
process.stdout.write(`Published ${snapshot.verification} benchmark snapshot with ${rows.length} comparable rows.\n`);

function baseline(name) {
  const item = report.reports.find(value => value.target.name === name);
  if (item === undefined) throw new Error(`Missing benchmark target: ${name}.`);
  return item.comparison.baseline.result;
}

function row(implementation, scenario, result) {
  return {
    implementation,
    scenario,
    throughput: result.requestsPerSecond,
    meanMs: result.meanMs,
    p50Ms: result.p50Ms,
    p95Ms: result.p95Ms,
    p99Ms: result.p99Ms,
    bytesPerResponse: result.receivedBytes / result.requests,
    failures: result.failures,
    throughputIqr: result.throughputIqr,
    p95IqrMs: result.p95IqrMs
  };
}
