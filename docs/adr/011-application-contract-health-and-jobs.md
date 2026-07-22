# ADR 011: Application contract, framework health and background work

## Status

Accepted for the strict App Router line.

## Context

An application should not need to understand Vite entries, renderer processes,
contract generation or publish choreography. At the same time, placing React UI
under `src/`, Server Actions under `Server/Actions` and route loaders under
`app/` made one feature appear to be three unrelated systems.

The framework also needs to support inexpensive single-instance deployments,
horizontal Azure deployments and background processing without accidentally
running one durable cron execution per web replica.

## Decision

The application-owned contract is:

```text
app/
  layout.drx
  page.drx
  page.server.cs
  _components/                 shared application presentation
  _actions/                    application-wide Server Actions
  (group)/feature/
    page.drx
    page.server.cs
    _components/               route-private React components
    _actions/                  route-private C# Server Actions
Server/                        application-owned C# structure
  Program.cs                   composition and explicit extensions
public/                        the only public asset root
src/
  actions.ts                   generated
  contracts.ts                 generated
  backend-manifest.json        generated
```

Underscore folders below `app/` are private and never become URL segments.
`page.server.cs` remains the only convention loader. A Server Action must live
below `_actions` and use the `*.server.cs` suffix. React components below
`app/` must live below `_components` or another explicitly private folder.

Only the `app/` structure is normative. DotReact does not prescribe folders,
layers or architectural style below `Server/`; vertical slices, clean
architecture, modular monoliths and simpler layouts are all supported. The
Domain/Application/Infrastructure/Jobs split used by the examples is a SOLID
recommendation for non-trivial systems, not a framework requirement.

`dotreact architecture` validates the `app/` contract with actionable diagnostics.
`dotreact check` and `dotreact doctor` include the same validation. Compatibility
escapes remain possible through lower-level ASP.NET APIs, but the strict starter
does not silently accept legacy zones.

The CLI owns build orchestration. `dotreact build` performs architecture
validation, managed-runtime preparation when vendored, contract generation,
client build, SSR build and the Release ASP.NET build. `dotreact health` runs the
complete project release gate. `dotreact security` audits application source and
known client/server dependency vulnerabilities.

The hosting facade always registers page-props caching:

- without Redis, a single-instance distributed-memory implementation has no
  external cost;
- with `DOTREACT_REDIS_CONNECTION`, pages, sessions and action coordination use
  Redis and share one connection multiplexer per process;
- personalized HTML remains `private, no-store`; only explicitly anonymous
  loader results can enter the shared page cache.

DotReact does not pretend that a web replica is a durable scheduler. Lightweight
best-effort work may use ASP.NET Core hosted services. Durable cron, queue and
long-running data processing use a dedicated worker, Azure Container Apps Job,
Azure Functions or an application-selected scheduler while reusing the same
Application and Infrastructure layers. This prevents duplicate execution when
the web tier scales and keeps renderer capacity independent from job capacity.

## Consequences

- A feature reads as one vertical App Router slice without mixing business rules
  into DRX or the renderer.
- New projects inherit build, health, security and cache behavior from the
  framework rather than copying orchestration code.
- React application code in `src/features` or `src/components` is a migration
  error because the canonical UI root is `app/`. Actions or static files under
  `Server/` remain supported and receive convention advice rather than errors.
- React SSR still requires a private Node renderer, so exact Razor-equivalent
  memory cannot be promised. Bounded concurrency, shared connections, route
  splitting and measurable budgets remain release requirements.
- Durable jobs are intentionally isolated from autoscaled web replicas instead
  of being hidden inside page requests or Server Actions.
