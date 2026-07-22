# DotReact roadmap

## Current release priorities

The framework is a runnable pre-release rather than a published ecosystem. Work
is prioritized in three explicit groups so implemented behavior is never mixed
with future promises.

### Required before a stable v1

- Container scanning, Bicep validation and credentialed Azure deployment smoke tests.

### Implemented rendering evolution

- Streaming SSR and Suspense in versioned protocol v2 with CSP nonce propagation.
- Build-scoped SSG/ISR, exact-path action invalidation and portable static export.
- Client router, prefetch, loading boundaries and layout-state preservation.
- Secure image optimization with a replaceable processor and SkiaSharp plugin.
- Loader/renderer/transfer timing separation and end-to-end performance budgets.

### External release gates

- Publish coordinated npm and NuGet packages only after local vendoring tests are complete.
- Produce signed provenance/SBOM artifacts and scan the exact release container.
- Validate App Service and Container Apps rollout/rollback with real Azure credentials.

Completed capabilities remain described in the milestones below. Deferred work
must appear only as deferred; documentation pages must not present it as available.

## M0 — Product boundary (complete)

- ASP.NET Core is the public edge and backend authority.
- React SSR runs in an internal Node sidecar.
- C# and React integrate through typed JSON, not a hybrid language.
- SSR plus hydration ships before React Server Components.

## M1 — Runtime vertical slice (complete)

- Protocol v1, renderer health and render endpoints.
- `AddDotReact` and `MapDotReactPage`.
- Safe hydration and interactive reference page.
- CLI scaffold and doctor.
- Deterministic C# to TypeScript generation and drift detection.
- Contract, integration, XSS, timeout, and smoke tests.
- Clean scaffold, production lifecycle and shutdown smoke-tested.

Exit gate: a fresh scaffold starts with one command, returns C# data in initial
HTML, hydrates without mismatch, and shuts down cleanly.

## M2 — Advanced contracts and routing (MVP complete)

- Implemented first slice: attribute discovery, generated backend manifest,
  `.drx` compilation, static registry and constrained dynamic ASP.NET routes.
- Implemented second slice: canonical root/nested `layout.drx` composition,
  semantic `.drx` checks and fail-closed backend manifest bijection.
- Implemented third slice: opt-in module-to-route convention, manifest route
  drift checks and backward-compatible explicit routes.
- Implemented closed generic contracts, nullable enum/collection coverage and
  opt-in precision-safe `decimal`/`long` string serialization.
- Implemented discriminated unions from `JsonPolymorphic`/`JsonDerivedType`,
  including string/integer discriminators and fail-closed collision checks.
- Implemented project-wide multi-assembly discovery for runtime and TypeGen inputs.
- Typed page results, redirects, status codes and nearest 404/error boundaries.
- Implemented invariant typed scalar and repeated collection query values through
  `GetQueryValue<T>` and cardinality-bounded `GetQueryValues<T>`.
- Implemented typed page-prop/URL delivery to root and nested layouts, checked
  against every descendant page contract.

## M3 — Production toolchain (implementation complete)

- Implemented first slice: separate client/SSR bundles, no Vite in production,
  ASP.NET-supervised loopback Node renderer, static assets, health endpoints and
  Azure-ready Dockerfiles.
- `dotreact create`, templates, safe generators, `sync`, `dev`, `check`, `build`,
  `analyze`, `benchmark`, `start`, and expanded `doctor` orchestration.
- Bounded restart policy, graceful process-tree shutdown, redacted logs and metrics.
- Cross-platform CI, SBOM/image gates, Azure App Service and Container Apps IaC.
- Compatibility matrix and deterministic `0.1.0` versions.
- External release gate: publish npm/NuGet artifacts, scan the built container and
  validate Bicep/deployment using registry and Azure credentials.

## M4 — Full-stack application features (MVP complete)

- Implemented first slice: explicitly exposed C# action classes, generated
  TypeScript clients, Problem Details, authorization-by-default and antiforgery.
- Implemented opt-in idempotency/replay, bounded bodies/store, client keys and
  safe action revalidation signals.
- Structured metadata API, error boundaries and progressive form-action binding.
- Structured correlated logging, renderer lifecycle and startup metrics.
- Implemented strict CSP/security headers, opt-in action rate limiting and
  OpenTelemetry-compatible action/renderer metrics and traces.
- Implemented page policy metadata, resource-based action policies, opt-in
  distributed props caching and automatic exact-path invalidation after actions.
- Implemented Redis-backed cross-replica idempotency with renewable leases and
  Redis-backed ISR artifacts/tag invalidation; verified against Microsoft Garnet.

The starter now validates the framework action transport; the CRUD application
continues to validate conventional ASP.NET Core endpoints and SQLite flows.

## M5 — Performance and advanced rendering

- Implemented first slice: bundle budgets, reproducible SSR p50/p95/p99 benchmark,
  renderer keep-alive/request tuning, `Content-Length` responses and safe static
  asset cache policy.
- Implemented streaming SSR/Suspense without breaking protocol v1.
- Implemented build-isolated static generation/ISR with bounded store and export CLI.
- Implemented enhanced client navigation while retaining native links.
- Implemented image optimization endpoint/component and Azure-aware deployment adapters.
- Benchmarks separating loader, renderer, and transfer time.
- Framework-owned SSR/client entries and lazy route chunks remove application bootstrap duplication.
- Production emits fingerprinted global/route CSS and initial module preloads from a build-generated private manifest before SSR HTML.
- Props have a fail-closed serialized-size budget and OpenTelemetry histogram.
- Browser CLS, INP, LCP and TTFB use a bounded same-origin collector correlated through W3C trace context.
- Local fonts support face-level critical preload and `@blackredsolutionsteam/dotreact-script` provides safe loading strategies.

## M6 — Experimental React architecture

- Flight frame transport and capability negotiation exist in protocol v2.
- `@blackredsolutionsteam/dotreact-rsc` uses the official Vite RSC plugin with pinned React/RSC versions,
  separates rsc/ssr/client environments and rejects JavaScript Server Actions.
- `examples/rsc` produces real SSR HTML, embedded Flight hydration data and a
  `text/x-component` response; it remains isolated from the stable DRX runtime.
- React 19.2 partial-prerender/resume primitives are implemented and tested with
  a static Suspense shell plus a resumed dynamic hole.
- Provider adapters may opt into PPR only when shared cache is explicitly available.

Personalized SSR HTML remains non-cacheable. Only pages explicitly annotated
with `DotReactPrerender` may produce public artifacts, and those artifacts reject
antiforgery and cookie markers.
