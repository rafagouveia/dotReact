# Changelog

## 0.1.0 - Unreleased

### Added

- Framework-owned hydration, development diagnostics and default route/root
  error fallbacks; DRX boundary files are now intentional application overrides.

- ASP.NET Core-owned SSR with React hydration.
- Typed C# props, generated TypeScript contracts and server actions.
- `.drx` pages, nested layouts, HMR and semantic checking.
- Safe file-route convention and manifest drift validation.
- SQLite CRUD reference application with SOLID boundaries.
- Production client/SSR bundles and supervised loopback Node renderer.
- Azure-compatible health endpoints and Docker scaffolds.
- Cross-platform CI quality and container build gates.
- Typed page status/redirect/not-found results and custom DRX boundaries.
- Safe SSR metadata and progressive HTML-form server actions.
- Complete CLI project lifecycle and VS Code diagnostics/loader navigation.
- Bounded Node restart supervision, graceful shutdown, redacted logs and metrics.
- Azure App Service and Container Apps Bicep templates with rollout guidance.
- Strict CSP/security headers, validated configuration and action rate limiting.
- OpenTelemetry-compatible renderer/action traces and metrics plus OTLP starter export.
- Idempotent Server Actions with bounded replay, payload limits and revalidation hints.
- Closed generic and precision-safe numeric C# to TypeScript contracts.
- `starter`/`minimal` CLI templates, safe generators, sync, bundle analysis and SSR benchmark.
- Renderer keep-alive/request tuning and safe static asset cache policies.
- Typed invariant query-string values for page loaders through `GetQueryValue<T>`.
- Interactive searchable documentation portal with architecture, guides and references.
- VS Code extension core checks in the monorepo build/test/typecheck gates.
- System.Text.Json polymorphic contracts emitted as closed discriminated TypeScript unions.
- Repository-ready CLI scaffolds with Git/editor defaults, pinned Node/.NET expectations,
  Docker exclusions and application CI, without implicitly running `git init`.
- Multi-assembly page/action discovery in ASP.NET registration and TypeGen.
- Declarative page policies and resource-based Server Action authorization.
- Opt-in distributed loader-result caching with automatic action invalidation.
- Vendored project-local CLI, installable VSIX packaging and real VS Code host tests.
- Formal Semantic Versioning, compatibility and deprecation policy for public surfaces.
- Client-side router with native links, prefetch, loading boundaries and preserved layouts.
- Protocol-v2 streaming SSR with real Suspense, backpressure, cancellation and CSP nonces.
- Build-scoped SSG/ISR, bounded single-flight storage, path/tag invalidation and static export CLI.
- Safe lazy antiforgery acquisition for Server Actions issued from static documents.
- React image component, hardened optimizer endpoint and optional SkiaSharp codec plugin.
- Deterministic deployment adapter contract with App Service/Container Apps capability checks.
- Browser E2E coverage for SSR, hydration/actions, navigation, Fast Refresh, streaming and ISR.
- Typed static-path providers exposed through an automatic prerender manifest and CLI export discovery.
- Redis-backed ISR/tag invalidation and cross-replica idempotent Server Actions with renewable leases.
- Experimental official-Vite RSC package/example and React 19.2 partial-prerender/resume primitives.
- Typed C# page props and current URL in preserved DRX layouts, with descendant-contract checking.
- Cardinality-bounded repeated query conversion through `GetQueryValues<T>`.
- Redis Cluster hash-slot-safe Lua keys and monotonic prerender tag-index retention.
- Per-request CSP nonces on the experimental RSC HTML/Flight example.
- Convention-based `DotReact.Hosting` facade that keeps renderer, Redis, images,
  security, observability and production composition out of application `Program.cs`.
- CLI workspace focus/reveal modes that hide managed infrastructure during daily
  application work without deleting or unversioning deployment configuration.
- Route-aware blocking CSS discovery in development so modular page/layout styles
  are present before the first SSR paint, plus an explicit SOLID feature convention.
- Unified `app/` router with co-located `page.drx` and `page.server.cs`,
  compile-time C# registration, route groups and private underscore folders.
- Same-origin .NET Hot Reload revision bridge that refreshes current SSR props
  through partial navigation while React modules retain Vite Fast Refresh.
- Background C# prop revalidation that preserves the mounted React page and its
  local state, with automatic restart only for unsupported CLR rude edits.
- Production-only Lighthouse runner and default Web Vitals/bundle budgets in
  generated projects, backed by Brotli/Gzip response compression.
- Strict App Router application contract with co-located `_components` and
  `_actions`, framework-owned build/health/security commands and actionable
  architecture diagnostics.
- Automatic single-instance page caching with zero external dependencies and
  Redis scale-out that shares one multiplexer across cache, sessions and action
  coordination.
- Formal background-work boundary for inexpensive web hosts and durable jobs,
  including Azure Container Apps Jobs/Functions guidance.

### Known gaps

- Packages have not been published to npm or NuGet.
- Real Azure deployment and image scanning require repository credentials and
  an external Azure environment.
- Full language-server refactoring/navigation beyond the VS Code loader CodeLens
  is not yet implemented.
- Legacy `src/pages` plus attributed `Server/Pages` applications remain
  compatible but have not yet reached their scheduled removal release.
- RSC/Flight and PPR are experimental and intentionally isolated from the stable DRX API.
