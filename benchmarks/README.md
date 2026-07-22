# DotReact comparative SSR benchmark

This suite compares the same validated 20-row accounting page in six production rendering modes:

- DotReact server-only SSR selected automatically by the compiler;
- DotReact interactive SSR with an ASP.NET Core loader, hydration payload and the managed private Node renderer;
- ASP.NET Core Razor Pages;
- Blazor static SSR (no interactive circuit).
- Next.js interactive SSR with a Client Component and hydration payload;
- Next.js dynamic Server Component without client-owned page state.

It measures both time to first byte and the full response body. Development/HMR
servers are deliberately excluded. The CLI bounds every response body, performs
warmup requests, records failures, throughput, transferred bytes, p50/p95/p99
and writes the machine-readable report to `benchmarks/results/latest.json`.
The server-rendering microbenchmark requests `Accept-Encoding: identity` for all
fixtures so a baseline that omits compression is not rewarded. Production
compression and browser transfer costs remain part of Lighthouse/resource tests.

```powershell
npm run build:tooling
npm run benchmark:compare
# Linux only: adds per-scenario CPU and process-tree RSS accounting
npm run benchmark:consumption
```

The Next.js fixture is intentionally not a monorepo workspace. Keeping its
dependencies and lockfile under `benchmarks/NextBaseline` prevents the comparator
from changing the framework release graph or its security audit. The `prebenchmark:*`
scripts run `npm run benchmark:setup` automatically. Run that setup command directly
only when preparing an offline or long-running benchmark host.

On Windows or macOS, run the canonical Linux sampler inside an otherwise idle
Docker Engine. Resource limits make local runs easier to repeat; the report still
remains a local engineering reference because the load generator shares the container:

```powershell
docker build -f benchmarks/Dockerfile -t dotreact-consumption .
docker run --rm --cpus=8 --memory=8g dotreact-consumption
```

The default local load is seven rounds of 3,000 requests at concurrency 64 after
250 concurrent warmup requests per route. Builds are prepared once, but the runner
starts exactly one fresh server process tree for one scenario, validates and warms
it, measures it, then confirms its complete shutdown before starting the next one.
No idle comparison server remains in memory. The runner rotates and reverses target
order and aggregates each metric independently by median. IQR exposes noisy runs
instead of allowing one favorable sample to represent the suite. Both uncached DotReact
modes require zero failures, p95 no greater than 75 ms and at least 1,500
requests/second. DotReact interactive SSR is compared with Next.js interactive
SSR; DotReact server-only SSR is compared with the server-only baselines.
Razor, Blazor and the Next.js Server Component route are also retained to expose
the cost of shipping a hydration payload instead of hiding it. Cache and ISR are
excluded from this ranking until every baseline has the same document, key and TTL.
Configure ratio budgets only on fixed CI hardware with an accepted baseline:

```powershell
$env:DOTREACT_BENCHMARK_REQUESTS = "10000"
$env:DOTREACT_BENCHMARK_CONCURRENCY = "64"
$env:DOTREACT_BENCHMARK_ROUNDS = "7"
$env:DOTREACT_BENCHMARK_MAX_P95_MS = "50"
$env:DOTREACT_BENCHMARK_MIN_THROUGHPUT = "500"
$env:DOTREACT_BENCHMARK_MAX_P95_RATIO = "1.25"
$env:DOTREACT_BENCHMARK_MIN_THROUGHPUT_RATIO = "0.80"
npm run benchmark:compare
```

Run on an otherwise idle, fixed-size machine and compare repeated runs from the
same environment. This microbenchmark does not replace Lighthouse, browser Web
Vitals, a database-backed load test, memory profiling or an Azure cost test. The
Blazor fixture is static SSR; interactive Blazor Server has a different persistent
connection and per-user memory model and must be benchmarked separately.

The runner uses one DotReact renderer worker by default so a four-process renderer
pool does not compete with a single Next.js process unnoticed. Public evidence must
come from the manually triggered `Performance benchmark` workflow on the dedicated
Linux runner. It uses ten rounds, 5,000 requests and a 1,000-request concurrent
warmup, samples the sole live server process tree every 100 ms only while that target
is under load, and reports peak RSS, CPU time and normalized CPU milliseconds per 1,000
responses for every scenario before shutting it down and moving to the next target.
It then uploads the raw report and publishable
snapshot. Resource sampling stays off on ordinary local runs so the profiler does
not perturb the request generator or create misleading cross-platform numbers.

## Local engineering reference

The documentation may display a local reference, but labels it as non-verified.
Local numbers are machine-specific diagnostics, not marketing claims. Do not copy
values into this README: inspect `results/latest.json`, which records hardware,
runtimes, commit, worker count, order, raw rounds, dispersion and limitations.

`node benchmarks/publish-results.mjs --allow-local` creates a clearly labelled
local snapshot. Omitting `--allow-local` fails closed unless the report came from
clean, dedicated benchmark infrastructure with at least seven rounds.
