# ADR 012: cache lifecycle, navigation maturity and Next.js parity

## Status

Accepted incrementally. Each slice must pass the repository release gates before
the next public capability is considered stable.

## Context

DotReact already supports SSR, streaming, hydration, lazy route chunks, client
navigation, Server Actions, SSG/ISR, Redis and Azure-oriented hosting. Maturity
requires bounded lifecycle semantics and evidence, not only feature names.

The public backend remains ASP.NET Core. Parity means equivalent product
capabilities where they fit that authority boundary; it does not mean embedding
a second Node.js business backend or claiming JavaScript Edge Runtime support.

## Decisions

1. Anonymous loader cache is opt-in and bounded by TTL and payload size.
2. Path and tag invalidation use version tokens. Invalidated keys become
   unreachable without unsafe Redis key enumeration and expire normally.
3. Redis SSG/ISR artifacts always have finite storage retention, including
   build-scoped static outputs. Regeneration preserves application correctness.
4. Client navigation uses an absolute-TTL LRU. Prefetch must never create an
   unbounded or tab-lifetime data cache.
5. Navigation evolves toward segment payloads and preserved layouts while the
   C# loader remains the data and authorization authority.
6. Cache and navigation diagnostics use stable low-cardinality metrics. Paths,
   tags, users, tenants, props and secrets are forbidden metric labels.
7. Performance claims require reproducible production-mode benchmarks against
   pinned comparison applications and published environment metadata.

## Capability order

1. Cache retention, tag invalidation, metrics and safety.
2. Router TTL/LRU, intent-aware prefetch and segment invalidation.
3. Server-only presentation boundaries and partial prerendering.
4. Parallel/intercepting route conventions where they preserve deterministic
   SSR and hydration.
5. CLI inspection, benchmark comparison and release evidence.

## Release evidence

- unit/integration tests for expiration, concurrency and invalidation;
- production client/SSR bundle budgets;
- Lighthouse CI on representative anonymous and authenticated routes;
- SSR throughput and latency benchmark with failures, p50, p95 and p99;
- security gates, dependency audits and cache-isolation tests;
- Azure App Service and Container Apps deployment/rollback validation.
