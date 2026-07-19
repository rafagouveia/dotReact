# Changelog

## 0.1.0 - Unreleased

### Added

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

### Known gaps

- Packages have not been published to npm or NuGet.
- Real Azure deployment and image scanning require repository credentials and
  an external Azure environment.
- Full language-server refactoring/navigation beyond the VS Code loader CodeLens
  is not yet implemented.
