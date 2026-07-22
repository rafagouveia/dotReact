import { execFileSync, spawn } from "node:child_process";
import { cpus, totalmem } from "node:os";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  aggregateBenchmarkSamples,
  benchmarkUrl,
  compareBenchmarkResults,
  evaluateBenchmarkThresholds,
  formatBenchmarkComparison
} from "../packages/cli/dist/benchmark.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requests = boundedInteger(process.env.DOTREACT_BENCHMARK_REQUESTS, 3_000, 10, 100_000);
const concurrency = boundedInteger(process.env.DOTREACT_BENCHMARK_CONCURRENCY, 64, 1, 256);
const warmup = boundedInteger(process.env.DOTREACT_BENCHMARK_WARMUP, 250, 0, 5_000);
const rounds = boundedInteger(process.env.DOTREACT_BENCHMARK_ROUNDS, 7, 3, 21);
const maxCandidateP95Ms = boundedNumber(process.env.DOTREACT_BENCHMARK_MAX_P95_MS, 75, 1, 60_000);
const minCandidateThroughput = boundedNumber(process.env.DOTREACT_BENCHMARK_MIN_THROUGHPUT, 1_500, 1, 1_000_000);
const maxP95Ratio = optionalBoundedNumber(process.env.DOTREACT_BENCHMARK_MAX_P95_RATIO, 0.1, 10);
const minThroughputRatio = optionalBoundedNumber(process.env.DOTREACT_BENCHMARK_MIN_THROUGHPUT_RATIO, 0.01, 10);
const children = new Set();
let stopping;
let resourceSampler;
const stop = () => stopping ??= Promise.all([...children].map(stopChild));
process.once("SIGINT", () => { void stop().finally(() => process.exit(130)); });
process.once("SIGTERM", () => { void stop().finally(() => process.exit(143)); });

try {
  const implementations = await prepareFixtures();
  resourceSampler = createResourceSampler();
  const options = { requests, concurrency, warmup, timeoutMs: 15_000, maxResponseBytes: 5 * 1024 * 1024 };
  const candidateUrl = "http://127.0.0.1:5180/benchmark";
  const interactiveCandidateUrl = "http://127.0.0.1:5180/benchmark-interactive";
  const targets = [
    { name: "DotReact server-only SSR", implementation: "DotReact", url: candidateUrl, mode: "server-only", interactive: false },
    { name: "DotReact interactive SSR", implementation: "DotReact", url: interactiveCandidateUrl, mode: "interactive", interactive: true },
    { name: "Razor Pages", implementation: "Razor", url: "http://127.0.0.1:5181/benchmark", mode: "server-only", interactive: false },
    { name: "Blazor static SSR", implementation: "Blazor SSR", url: "http://127.0.0.1:5182/benchmark", mode: "server-only", interactive: false },
    { name: "Next.js interactive SSR", implementation: "Next.js", url: "http://127.0.0.1:5183/benchmark", mode: "interactive", interactive: true },
    { name: "Next.js Server Component", implementation: "Next.js", url: "http://127.0.0.1:5183/benchmark-server", mode: "server-only", interactive: false }
  ];
  const samples = new Map(targets.map(target => [target.url, []]));
  const executionOrder = [];
  for (let round = 0; round < rounds; round += 1) {
    const order = rotate(targets, round);
    if (round % 2 === 1) order.reverse();
    executionOrder.push(order.map(target => target.name));
    for (const target of order) {
      process.stdout.write(`Round ${round + 1}/${rounds} · ${target.name}\n`);
      const descriptor = implementations.get(target.implementation);
      if (descriptor === undefined) throw new Error(`Missing implementation descriptor for ${target.implementation}.`);
      await assertPortAvailable(descriptor.port);
      const host = startHost(descriptor);
      try {
        await waitForReady(host);
        await validateFixture(target);
        if (options.warmup > 0)
          await benchmarkUrl({ ...options, url: target.url, requests: options.warmup, warmup: 0 }, forwardedHttpsFetch);
        const execute = () => benchmarkUrl({ ...options, url: target.url, warmup: 0 }, forwardedHttpsFetch);
        const result = resourceSampler === undefined
          ? await execute()
          : await resourceSampler.measure(target.name, host.child.pid, execute);
        samples.get(target.url).push(result);
      } finally {
        await stopChild(host.child);
        await assertPortAvailable(descriptor.port);
      }
    }
  }
  const resultFor = url => aggregateBenchmarkSamples(samples.get(url));
  const candidate = resultFor(candidateUrl);
  const interactiveCandidate = resultFor(interactiveCandidateUrl);
  const candidateFailures = [];
  if (candidate.failures > 0) candidateFailures.push(`candidate returned ${candidate.failures} failed request(s)`);
  if (candidate.p95Ms > maxCandidateP95Ms)
    candidateFailures.push(`candidate p95 ${candidate.p95Ms.toFixed(1)} ms exceeds ${maxCandidateP95Ms.toFixed(1)} ms`);
  if (candidate.requestsPerSecond < minCandidateThroughput)
    candidateFailures.push(`candidate throughput ${candidate.requestsPerSecond.toFixed(1)} req/s is below ${minCandidateThroughput.toFixed(1)} req/s`);
  if (interactiveCandidate.failures > 0)
    candidateFailures.push(`interactive candidate returned ${interactiveCandidate.failures} failed request(s)`);
  if (interactiveCandidate.p95Ms > maxCandidateP95Ms)
    candidateFailures.push(`interactive candidate p95 ${interactiveCandidate.p95Ms.toFixed(1)} ms exceeds ${maxCandidateP95Ms.toFixed(1)} ms`);
  if (interactiveCandidate.requestsPerSecond < minCandidateThroughput)
    candidateFailures.push(`interactive candidate throughput ${interactiveCandidate.requestsPerSecond.toFixed(1)} req/s is below ${minCandidateThroughput.toFixed(1)} req/s`);
  const reports = [];
  const baselines = [];
  const baselineTargets = [
    { name: "Razor Pages", url: "http://127.0.0.1:5181/benchmark", mode: "dynamic-template" },
    { name: "Blazor static SSR", url: "http://127.0.0.1:5182/benchmark", mode: "dynamic-component" },
    { name: "Next.js interactive SSR", url: "http://127.0.0.1:5183/benchmark", mode: "interactive-ssr" },
    { name: "Next.js Server Component", url: "http://127.0.0.1:5183/benchmark-server", mode: "server-component" }
  ];
  for (const target of baselineTargets) {
    const baselineUrl = target.url;
    const baseline = resultFor(baselineUrl);
    baselines.push({ ...target, result: baseline });
    const comparedCandidateUrl = target.mode === "interactive-ssr" ? interactiveCandidateUrl : candidateUrl;
    const comparedCandidate = target.mode === "interactive-ssr" ? interactiveCandidate : candidate;
    const comparison = compareBenchmarkResults(comparedCandidateUrl, comparedCandidate, baselineUrl, baseline);
    const failures = maxP95Ratio === undefined && minThroughputRatio === undefined ? []
      : evaluateBenchmarkThresholds(comparison, {
          maxP95Ratio: maxP95Ratio ?? Number.POSITIVE_INFINITY,
          minThroughputRatio: minThroughputRatio ?? 0,
          maxFailureRate: 0
        });
    if (baseline.failures > 0)
      failures.unshift(`baseline returned ${baseline.failures} failed request(s); comparison is invalid`);
    reports.push({ target, candidateMode: target.mode === "interactive-ssr" ? "interactive" : "server-only",
      comparison, failures, passed: failures.length === 0 });
    const comparisonStatus = maxP95Ratio === undefined && minThroughputRatio === undefined
      ? "Comparison is informational; enable ratio budgets explicitly in controlled CI."
      : failures.length === 0 ? "Ratio gate passed." : `Ratio gate failed: ${failures.join("; ")}.`;
    process.stdout.write(`${formatBenchmarkComparison(comparison)}\n${comparisonStatus}\n\n`);
  }
  const resourceUsage = resourceSampler === undefined ? null : await resourceSampler.stop();
  resourceSampler = undefined;
  const output = resolve(root, "benchmarks/results/latest.json");
  await mkdir(dirname(output), { recursive: true });
  const environment = await environmentMetadata();
  await writeFile(output, `${JSON.stringify({
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    suiteRevision: "accounting-reconciliation-v2",
    publishable: environment.dedicated === true && !environment.gitDirty && rounds >= 7,
    limitations: [
      "Localhost microbenchmark; the load generator shares the machine with the measured server.",
      "Exactly one server process tree is alive at a time; every scenario and round starts from a fresh process.",
      ...(resourceUsage === null
        ? ["CPU and RSS sampling require the dedicated Linux benchmark runner."]
        : []),
      "Interactive browser hydration is measured by the separate Lighthouse/Web Vitals suite."
    ],
    environment,
    options: { ...options, rounds, representative: "independent-metric-medians", executionOrder,
      isolation: "fresh-single-process-tree-per-scenario-round",
      compression: "identity", workload: "same 20-row accounting reconciliation fixture" },
    samples: Object.fromEntries(samples),
    thresholds: { maxCandidateP95Ms, minCandidateThroughput, maxP95Ratio, minThroughputRatio,
      maxFailureRate: 0 },
    candidate,
    interactiveCandidate,
    resourceUsage,
    candidateGate: { passed: candidateFailures.length === 0, failures: candidateFailures },
    reports
  }, null, 2)}\n`);
  if (candidateFailures.length > 0) {
    process.stderr.write(`DotReact regression gate failed: ${candidateFailures.join("; ")}.\n`);
    process.exitCode = 1;
  } else process.stdout.write("DotReact absolute regression gate passed.\n");
  if (reports.some(report => !report.passed)) process.exitCode = 1;
} finally {
  if (resourceSampler !== undefined) await resourceSampler.stop();
  await stop();
}

function rotate(items, offset) {
  return items.map((_, index) => items[(index + offset) % items.length]);
}

async function validateFixture(target) {
  const response = await forwardedHttpsFetch(target.url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${target.name} fixture returned HTTP ${response.status}.`);
  const html = await response.text();
  if (!html.includes("Accounting reconciliation benchmark"))
    throw new Error(`${target.name} fixture is missing the canonical title.`);
  for (let index = 1; index <= 20; index += 1) {
    const code = `DOC-${String(index).padStart(4, "0")}`;
    if (!html.includes(code)) throw new Error(`${target.name} fixture is missing ${code}.`);
  }
  const text = html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  const hasButton = text.includes("Count 0");
  if (hasButton !== target.interactive)
    throw new Error(`${target.name} interaction model does not match its declared scenario.`);
}

async function environmentMetadata() {
  const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const nextPackage = JSON.parse(await readFile(resolve(root, "benchmarks/NextBaseline/package.json"), "utf8"));
  const cpu = cpus()[0];
  return {
    platform: process.platform,
    release: process.release.name,
    arch: process.arch,
    cpu: cpu?.model ?? "unknown",
    logicalCores: cpus().length,
    totalMemoryBytes: totalmem(),
    node: process.version,
    dotnet: commandVersion("dotnet", ["--version"]),
    dotReact: packageJson.version,
    next: nextPackage.dependencies?.next ?? "unknown",
    react: nextPackage.dependencies?.react ?? "unknown",
    gitCommit: commandVersion("git", ["rev-parse", "HEAD"]),
    gitDirty: commandVersion("git", ["status", "--porcelain"]).length > 0,
    dedicated: process.env.DOTREACT_BENCHMARK_DEDICATED === "true",
    dotReactRendererWorkers: boundedInteger(process.env.DOTREACT_BENCHMARK_RENDERER_WORKERS, 1, 1, 32)
  };
}

function commandVersion(command, args) {
  try { return execFileSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true }).trim(); }
  catch { return "unknown"; }
}

function startHost(descriptor) {
  if (descriptor === undefined) throw new Error("Benchmark implementation descriptor was not found.");
  const child = spawn(descriptor.command, descriptor.args, {
    cwd: descriptor.cwd,
    env: {
      ...process.env,
      ASPNETCORE_URLS: `http://127.0.0.1:${descriptor.port}`,
      ASPNETCORE_ENVIRONMENT: "Production",
      ASPNETCORE_FORWARDEDHEADERS_ENABLED: "true",
      Logging__LogLevel__Default: "Warning",
      Logging__LogLevel__Microsoft: "Warning",
      "Logging__LogLevel__Microsoft.AspNetCore.Antiforgery": "Error",
      "Logging__LogLevel__Microsoft.AspNetCore.DataProtection": "Error",
      "Logging__LogLevel__Microsoft.AspNetCore.Hosting.Diagnostics": "Error",
      ...(descriptor.label === "DotReact" ? {
        DOTREACT_RENDERER_WORKERS: process.env.DOTREACT_BENCHMARK_RENDERER_WORKERS ?? "1"
      } : {}),
      ...descriptor.environment
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32"
  });
  children.add(child);
  child.stdout.on("data", chunk => process.stdout.write(`[${descriptor.label}] ${chunk}`));
  child.stderr.on("data", chunk => process.stderr.write(`[${descriptor.label}] ${chunk}`));
  return { child, label: descriptor.label,
    ready: `http://127.0.0.1:${descriptor.port}${descriptor.readyPath}` };
}

async function prepareFixtures() {
  const runtimeRoot = resolve(root, "benchmarks/results/runtime");
  const starterRoot = resolve(root, "examples/starter");
  const dotReactPublish = resolve(runtimeRoot, "dotreact");
  const razorPublish = resolve(runtimeRoot, "razor");
  const blazorPublish = resolve(runtimeRoot, "blazor");
  await rm(runtimeRoot, { recursive: true, force: true });
  await mkdir(runtimeRoot, { recursive: true });

  runBuild(process.execPath, [resolve(root, "packages/cli/dist/index.js"), "build"], starterRoot, "DotReact production build");
  runBuild("dotnet", ["publish", "Server/Server.csproj", "-c", "Release", "-o", dotReactPublish, "/p:UseAppHost=false"], starterRoot, "DotReact publish");
  await cp(resolve(starterRoot, "dist/client"), resolve(dotReactPublish, "wwwroot"), { recursive: true });
  await cp(resolve(starterRoot, "dist/server"), resolve(dotReactPublish, "frontend/server"), { recursive: true });
  await cp(resolve(root, "packages/renderer/dist"), resolve(dotReactPublish, "renderer"), { recursive: true });

  runBuild("dotnet", ["publish", "RazorBaseline.csproj", "-c", "Release", "-o", razorPublish, "/p:UseAppHost=false"],
    resolve(root, "benchmarks/RazorBaseline"), "Razor Pages publish");
  runBuild("dotnet", ["publish", "BlazorBaseline.csproj", "-c", "Release", "-o", blazorPublish, "/p:UseAppHost=false"],
    resolve(root, "benchmarks/BlazorBaseline"), "Blazor SSR publish");
  const nextExecutable = resolve(root, "benchmarks/NextBaseline/node_modules/next/dist/bin/next");
  runBuild(process.execPath, [nextExecutable, "build"],
    resolve(root, "benchmarks/NextBaseline"), "Next.js production build");

  return new Map([
    ["DotReact", { label: "DotReact", command: "dotnet", args: ["Server.dll"], cwd: dotReactPublish,
      port: 5180, readyPath: "/_health/live", environment: { DOTREACT_CLIENT_SCRIPT_SRC: "/_dotreact/client.js" } }],
    ["Razor", { label: "Razor", command: "dotnet", args: ["RazorBaseline.dll"], cwd: razorPublish,
      port: 5181, readyPath: "/benchmark" }],
    ["Blazor SSR", { label: "Blazor SSR", command: "dotnet", args: ["BlazorBaseline.dll"], cwd: blazorPublish,
      port: 5182, readyPath: "/benchmark" }],
    ["Next.js", { label: "Next.js", command: process.execPath,
      args: [nextExecutable, "start", "--hostname", "127.0.0.1", "--port", "5183"],
      cwd: resolve(root, "benchmarks/NextBaseline"), port: 5183, readyPath: "/benchmark" }]
  ]);
}

function runBuild(command, args, cwd, label) {
  process.stdout.write(`Preparing ${label}...\n`);
  execFileSync(command, args, { cwd, env: process.env, stdio: "inherit", windowsHide: true });
}

async function stopChild(child) {
  if (child === undefined) return;
  if (child.exitCode === null && child.signalCode === null) {
    if (process.platform === "win32") {
      await new Promise(resolvePromise => {
        const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
          stdio: "ignore", windowsHide: true
        });
        killer.once("error", () => resolvePromise());
        killer.once("exit", () => resolvePromise());
      });
    } else {
      try { child.kill("SIGTERM"); }
      catch { /* process already exited */ }
    }
  }
  await waitForExit(child, 10_000);
  if (process.platform !== "win32") await waitForProcessGroupExit(child.pid, 2_000);
  if (process.platform !== "win32" && processGroupExists(child.pid)) {
    try { process.kill(-child.pid, "SIGKILL"); }
    catch { /* process group already exited */ }
    await waitForProcessGroupExit(child.pid, 2_000);
  }
  children.delete(child);
  if (child.exitCode === null && child.signalCode === null)
    throw new Error(`Process ${child.pid} did not terminate; refusing to continue with a contaminated benchmark.`);
  if (process.platform !== "win32" && processGroupExists(child.pid))
    throw new Error(`Process group ${child.pid} did not terminate; refusing to continue with a contaminated benchmark.`);
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await Promise.race([
    new Promise(resolvePromise => child.once("exit", resolvePromise)),
    new Promise(resolvePromise => setTimeout(resolvePromise, timeoutMs))
  ]);
}

function processGroupExists(processGroupId) {
  try { process.kill(-processGroupId, 0); return true; }
  catch { return false; }
}

async function waitForProcessGroupExit(processGroupId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (processGroupExists(processGroupId) && Date.now() < deadline)
    await new Promise(resolvePromise => setTimeout(resolvePromise, 25));
}

async function assertPortAvailable(port) {
  await new Promise((resolvePromise, reject) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", error => reject(new Error(
      `Benchmark port ${port} is still occupied; refusing to run a non-isolated comparison. ${error.message}`)));
    probe.listen({ host: "127.0.0.1", port, exclusive: true }, () =>
      probe.close(closeError => closeError === undefined ? resolvePromise() : reject(closeError)));
  });
}

async function waitForReady(host) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (host.child.exitCode !== null) throw new Error(`${host.label} exited before becoming ready.`);
    try {
      const response = await fetch(host.ready, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch { /* build/startup still in progress */ }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 250));
  }
  throw new Error(`${host.label} did not become ready within 180 seconds.`);
}

function boundedInteger(raw, fallback, minimum, maximum) {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new Error(`Expected an integer between ${minimum} and ${maximum}.`);
  return value;
}

function boundedNumber(raw, fallback, minimum, maximum) {
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < minimum || value > maximum)
    throw new Error(`Expected a number between ${minimum} and ${maximum}.`);
  return value;
}

function optionalBoundedNumber(raw, minimum, maximum) {
  if (raw === undefined) return undefined;
  return boundedNumber(raw, Number.NaN, minimum, maximum);
}

function createResourceSampler() {
  const enabled = process.platform === "linux"
    && (process.env.DOTREACT_BENCHMARK_SAMPLE_RESOURCES === "true"
      || process.env.DOTREACT_BENCHMARK_DEDICATED === "true");
  if (!enabled) return undefined;

  const clockTicks = Number(commandVersion("getconf", ["CLK_TCK"])) || 100;
  const measurements = new Map();

  return {
    async measure(targetName, rootPid, action) {
      if (!Number.isSafeInteger(rootPid)) return await action();
      const measurement = measurements.get(targetName) ?? {
        host: targetName.startsWith("DotReact") ? "DotReact"
          : targetName.startsWith("Razor") ? "Razor"
            : targetName.startsWith("Blazor") ? "Blazor SSR" : "Next.js",
        peakRssBytes: 0,
        cpuTicks: 0,
        samples: 0,
        rounds: 0
      };
      measurements.set(targetName, measurement);
      const before = await readLinuxProcessTree(rootPid);
      measurement.peakRssBytes = Math.max(measurement.peakRssBytes, before.rssBytes);
      measurement.samples += 1;
      let pending = Promise.resolve();
      const sample = () => {
        pending = pending.then(async () => {
          const current = await readLinuxProcessTree(rootPid);
          measurement.peakRssBytes = Math.max(measurement.peakRssBytes, current.rssBytes);
          measurement.samples += 1;
        }).catch(() => undefined);
      };
      const timer = setInterval(sample, 100);
      timer.unref();
      try { return await action(); }
      finally {
        clearInterval(timer);
        await pending;
        const after = await readLinuxProcessTree(rootPid);
        measurement.peakRssBytes = Math.max(measurement.peakRssBytes, after.rssBytes);
        measurement.cpuTicks += Math.max(0, after.cpuTicks - before.cpuTicks);
        measurement.samples += 1;
        measurement.rounds += 1;
      }
    },
    async stop() {
      return Object.fromEntries([...measurements].map(([targetName, measurement]) => [targetName, {
        host: measurement.host,
        peakRssBytes: measurement.peakRssBytes,
        cpuTimeSeconds: measurement.cpuTicks / clockTicks,
        cpuMillisecondsPer1000Requests: measurement.cpuTicks / clockTicks * 1_000_000
          / Math.max(1, requests * measurement.rounds),
        measuredRequests: requests * measurement.rounds,
        rounds: measurement.rounds,
        samples: measurement.samples,
        samplingIntervalMs: 100
      }]));
    }
  };
}

async function readLinuxProcessTree(rootPid) {
  const queue = [rootPid];
  const seen = new Set();
  let rssBytes = 0;
  let cpuTicks = 0;
  while (queue.length > 0) {
    const pid = queue.shift();
    if (!Number.isSafeInteger(pid) || seen.has(pid)) continue;
    seen.add(pid);
    try {
      const [status, stat, children] = await Promise.all([
        readFile(`/proc/${pid}/status`, "utf8"),
        readFile(`/proc/${pid}/stat`, "utf8"),
        readFile(`/proc/${pid}/task/${pid}/children`, "utf8")
      ]);
      const rss = /^VmRSS:\s+(\d+)\s+kB$/m.exec(status);
      rssBytes += Number(rss?.[1] ?? 0) * 1024;
      const fields = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/);
      cpuTicks += Number(fields[11] ?? 0) + Number(fields[12] ?? 0);
      for (const child of children.trim().split(/\s+/)) {
        const childPid = Number(child);
        if (Number.isSafeInteger(childPid)) queue.push(childPid);
      }
    } catch { /* process exited between discovery and sampling */ }
  }
  return { rssBytes, cpuTicks };
}

function forwardedHttpsFetch(url, init) {
  return fetch(url, {
    ...init,
    // Rendering throughput must not reward fixtures that omit production compression
    // or penalize DotReact for compressing every response. Browser compression and
    // transferred bytes are covered separately by Lighthouse/resource tests.
    headers: {
      ...Object.fromEntries(new Headers(init.headers).entries()),
      "Accept-Encoding": "identity",
      "X-Forwarded-Proto": "https"
    }
  });
}
