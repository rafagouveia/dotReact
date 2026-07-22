# DotReact

[![Quality](https://github.com/rafagouveia/dotReact/actions/workflows/ci.yml/badge.svg)](https://github.com/rafagouveia/dotReact/actions/workflows/ci.yml)
[![Documentation](https://github.com/rafagouveia/dotReact/actions/workflows/pages.yml/badge.svg)](https://rafagouveia.github.io/dotReact/)
[![License: MPL 2.0](https://img.shields.io/badge/license-MPL--2.0-blue.svg)](LICENSE)

DotReact is an experimental full-stack framework that keeps ASP.NET Core in
charge of HTTP, authentication, services, and data while React renders the UI
on the server and hydrates it in the browser.

This repository contains a reusable pre-release framework, CLI scaffold and three
reference applications. The runtime boundary and production lifecycle are
implemented; coordinated private npm and NuGet packages are available at version `0.1.3`.
Public surfaces follow the repository's [compatibility and deprecation policy](COMPATIBILITY.md).

The source is licensed under [MPL 2.0](LICENSE). Applications may use DotReact,
including commercially, without opening unrelated application code. When a
covered framework file is modified and distributed, that file remains available
under MPL 2.0 with its notices preserved.

## What works now

- ASP.NET Core page loaders returning typed C# props.
- Typed invariant route, scalar and bounded collection query-string values in page loaders.
- Versioned JSON transport to an internal Node renderer.
- React 19 buffered and streaming SSR through Vite, including Suspense boundaries.
- Safe hydration payload and browser hydration.
- Deterministic C# to TypeScript contract generation with a drift check.
- Opt-in `.drx` pages compiled as TSX with a static Vite page registry.
- Root and nested `layout.drx` composition shared by SSR/hydration, with typed C# page props available to layouts.
- Client navigation, link prefetch, History API, loading boundaries and preserved layout state.
- Semantic `.drx` type checking and frontend/backend manifest validation.
- Opt-in file route convention shared by C#, TypeGen and the Vite checker.
- Production client/SSR bundles, supervised Node rendering and Azure health endpoints.
- Discovered dynamic C# page loaders and typed C# server actions.
- Multi-assembly page/action discovery shared by runtime and TypeGen.
- Declarative page policies and resource-based Server Action authorization.
- Revocable, rotated `HttpOnly` cookie sessions with Redis-backed cross-replica invalidation.
- Opt-in distributed loader-result caching with automatic action invalidation.
- Build-scoped SSG/ISR with single-flight, stale-while-revalidate and static export.
- Typed C# static-path providers and automatic prerender-manifest discovery for export.
- Optional Redis stores for cross-replica ISR/tag invalidation and Server Action idempotency.
- Typed page results for success, redirects and not-found responses.
- Framework-owned route and root error fallbacks with optional root/nested DRX overrides.
- Structured page metadata rendered during SSR without accepting arbitrary HTML.
- JSON and progressive HTML-form binding for discovered server actions.
- Authorization-by-default and antiforgery protection for server actions.
- Opt-in idempotent actions, bounded replay, payload limits and revalidation signals.
- Closed generic contracts and precision-safe `decimal`/`long` string contracts.
- System.Text.Json polymorphic DTOs emitted as discriminated TypeScript unions.
- Strict production CSP with per-request streaming nonces and opt-in action rate limiting.
- Secure image endpoint, React `Image` component and cross-platform SkiaSharp processor plugin.
- Versioned deployment adapter contract and deterministic Azure manifests.
- OpenTelemetry traces/metrics with correlated browser CLS/INP/LCP/TTFB and optional OTLP export.
- Safe static-asset caching, renderer keep-alive tuning, page-props limits and separate initial/async/CSS/SSR budgets.
- Route-aware fingerprinted CSS and initial module preloads in the SSR head,
  generated from a private production asset manifest.
- Framework-owned client/SSR entries, route-level JavaScript chunks, critical-face font preloads and validated Script loading strategies.
- A reusable CLI with templates, generators, `sync`, `analyze` and `benchmark`.
- VS Code DRX tooling with coalesced check-on-save diagnostics, project health,
  validation output and direct navigation to colocated C# loaders.
- Localized, Marketplace-ready VSIX with Workspace Trust boundaries, a dedicated
  icon and a real VS Code Extension Host test.
- Renderer health endpoint, correlation IDs, timeouts, and safe production errors.
- Bounded renderer restart supervision, graceful shutdown, token redaction and metrics.
- Azure App Service/Container Apps Bicep templates and reproducible CI gates.
- TypeScript protocol tests and .NET integration tests.
- An isolated, version-pinned Vite RSC pipeline and React 19.2 PPR primitives with real tests.

React Server Components/Flight and partial prerendering are implemented as an
isolated experimental package/example, not represented as stable DRX APIs. Package publication and
credentialed Azure deployment validation are external release gates.

## Run the included starter

Requirements: Node.js 22.19+ (24.x recommended) and .NET SDK 10.

```powershell
npm install
npm run build
npm run dev
```

Open `http://127.0.0.1:5080`. The initial HTML contains the value loaded in C#;
the counter proves that React hydrated the same tree in the browser.

## Create a project

Using the published private CLI package:

```powershell
npm exec --yes --package=@rafagouveia/dotreact-cli@0.1.3 -- dotreact create my-app --template starter
cd my-app
npm install
npm run dev
```

Generated projects pin the CLI, browser runtime, renderer, Vite integration,
NuGet hosting libraries and local TypeGen tool to one exact DotReact version.
Framework source is not copied into product repositories. Use
`dotreact upgrade <version>` to align every runtime surface before reinstalling
and running the release gates.

Private prerelease packages are hosted under the `rafagouveia` GitHub Packages
namespace. Publishing remains manual and opt-in; normal CI never republishes a
package. See [Private GitHub Packages](docs/private-packages.md)
for package coordinates, token permissions, local archive validation and cost
controls.

Scaffolds start in workspace **focus mode**. Daily editing shows application
code and supported extension points; generated boundaries, compiler bootstrap,
deployment assets and managed runtime configuration remain versioned but hidden.
Use `dotreact workspace reveal` for an explicit infrastructure task and
`dotreact workspace focus` to restore the application view.

Generated projects document a feature-first SOLID convention: Domain owns
invariants, Application owns one focused use case and narrow ports per
operation, Infrastructure implements those ports, and loaders/actions remain
thin Presentation adapters.

Scaffolds are repository-ready without creating a `.git` directory. They include
Git/editor line-ending rules, Node and .NET version expectations, Docker context
exclusions and a GitHub Actions workflow. Run `npm install` and commit the
resulting lockfile before the first push.

Inside a generated project, the complete lifecycle is:

```powershell
npm exec -- dotreact doctor
npm exec -- dotreact dev
npm exec -- dotreact generate page catalog/[slug]
npm exec -- dotreact generate action SaveCatalog
npm exec -- dotreact sync
npm exec -- dotreact check
npm exec -- dotreact build
dotreact workspace status
dotreact workspace reveal
dotreact workspace focus
dotreact analyze
dotreact benchmark http://127.0.0.1:5080/
dotreact benchmark https://candidate.example.com/ --compare https://baseline.example.com/ --max-p95-ratio 1.25 --min-throughput-ratio 0.80 --json
dotreact export
dotreact start
```

`start` creates a self-contained `.dotreact/publish` layout, runs ASP.NET Core
as the public process and supervises the private production Node renderer.
Generators support `--dry-run`, reject paths that could escape the project and
never overwrite an existing file.

Set `OTEL_EXPORTER_OTLP_ENDPOINT` in the host to export ASP.NET Core, renderer,
Server Action and browser Web Vitals traces/metrics over OTLP. No request props,
tokens, request IDs or URLs are used as telemetry labels.

The repository also includes production-equivalent DotReact, Razor Pages and
Blazor static SSR fixtures. `npm run benchmark:compare` measures TTFB and the
complete bounded response body, rejects failed requests and writes a JSON report.
Do not compare development/HMR servers.

Set `DOTREACT_REDIS_CONNECTION` for shared ISR and idempotency across replicas,
and `DOTREACT_BUILD_ID` to the immutable deployment/revision identifier. The
starter also recognizes Azure Container Apps and App Service revision IDs.

## Page contract

New applications co-locate the server loader and React route in `app/`:

```csharp
public sealed class HomePageLoader(TimeProvider timeProvider)
    : IDotReactPage<HomePageProps>
{
    public ValueTask<HomePageProps> LoadAsync(
        DotReactPageContext context,
        CancellationToken cancellationToken) =>
        ValueTask.FromResult(new HomePageProps(
            "Hello from C#",
            timeProvider.GetUtcNow()));
}
```

The matching `app/page.drx` consumes the generated TypeScript contract. The C#
file is `app/page.server.cs`; its route registration is generated from the path:

```tsx
export default function HomePage(props: HomePageProps) {
  return <h1>{props.message}</h1>;
}
```

C# expressions are deliberately not embedded in JSX. The integration boundary
is serialized generated props and explicitly exposed typed server actions. This
keeps C# authoritative for backend behavior while preserving ordinary React/TSX
tooling and Fast Refresh.

The app router supports dynamic and catch-all segments, route groups such as
`(operations)` that do not alter the URL, private `_components` folders, nested
layouts and nearest loading/not-found/error boundaries. `[DotReactPage]` remains
an explicit compatibility escape hatch for constrained ASP.NET patterns.

Regenerate or verify contracts with:

```powershell
npm run generate
npm run check:contracts
npm run typecheck
```

Run every framework, documentation, contract, test and dependency gate with:

```powershell
npm run verify
```

`typecheck` validates ordinary TypeScript, every `.drx` page/layout, its React
component signature and the exact page-module bijection with the C# manifest.

## Repository map

```text
dotnet/src/DotReact.AspNetCore   ASP.NET integration and HTML shell
dotnet/src/DotReact.AppGenerator compile-time app/page.server.cs registration
dotnet/src/DotReact.Hosting     convention-based application composition facade
dotnet/src/DotReact.Images.SkiaSharp optional cross-platform image processor
dotnet/src/DotReact.Redis       shared ISR and action-idempotency stores
packages/protocol               shared renderer protocol for TypeScript
packages/renderer               private Node/Vite SSR sidecar
packages/client                 hydration and typed Server Action client
packages/image                  optimized React Image component
packages/adapter                deployment contracts and Azure adapter
packages/rsc                    experimental official-Vite RSC and React PPR layer
packages/vite                   .drx compiler, registry and semantic checker
packages/cli                    scaffold and diagnostics CLI
examples/starter                executable reference application
examples/crud                   SOLID SQLite CRUD reference application
examples/rsc                    isolated real RSC/Flight reference application
editors/vscode-dotreact         DRX tooling, diagnostics, loader navigation and Marketplace release
deploy/azure                    App Service and Container Apps infrastructure
docs/adr                        architectural decisions
```

Generated applications enforce only the App Router surface: routes and React
components live below `app/`, while the internal organization of `Server/` is
application-owned. Co-located Server Actions are the generated convention, not
the only supported C# layout. `public/` is the framework-managed asset root and
`src/` contains generated boundary artifacts only.
`dotreact architecture` explains violations, `dotreact build` owns the complete
client/SSR/.NET build, and `dotreact health` executes the release gate. Durable
jobs run outside autoscaled web replicas while reusing the same Application
layer; see [ADR 011](./docs/adr/011-application-contract-health-and-jobs.md).

## Interactive documentation

The [published framework guide](https://rafagouveia.github.io/dotReact/) is an
interactive application with searchable
navigation, paired C#/React examples, a beginner learning path, SOLID/CRUD
recipes, security guidance and complete Docker/Azure deployment runbooks.

```powershell
npm install --prefix docs
npm run docs:dev
```

Open `http://127.0.0.1:5100`. Validate the production documentation bundle with
`npm run docs:typecheck` and `npm run docs:build`.

GitHub Pages is deployed only from `main`. The workflow obtains the repository
base path from GitHub, so scripts, CSS and images work both at `/` and under
`/dotReact/` without hard-coded origins.

## Contributing

Contributions are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), follow
the architecture rules in [AGENTS.md](AGENTS.md), and send security findings
through the private process in [SECURITY.md](SECURITY.md). Pull requests must
keep the full quality gate green and update Portuguese and English documentation
together when public behavior changes.

Contributor credit is preserved through Git history, release notes and license
notices. MPL 2.0 permits commercial use; it is not a non-commercial license. Its
file-level copyleft protects distributed changes to DotReact itself without
forcing an entire product built with the framework to adopt the same license.

Routine CI intentionally validates code, contracts, documentation, dependencies
and VSIX packaging only. Infrastructure compilation, container builds and full
browser suites are run when relevant instead of blocking every commit. A manual
or `vscode-v*` tag workflow creates the tested VSIX artifact. The protected
release job publishes that exact artifact through short-lived GitHub OIDC and
Microsoft Entra credentials after the Marketplace publisher identity has been
authorized.

## Quality commands

```powershell
npm run typecheck
npm test
npm run build
dotnet test dotnet/DotReact.slnx
npm audit --audit-level=high
npm run audit:dotnet
```

See [ROADMAP.md](./ROADMAP.md) for milestone scope and release gates.
See [docs/compatibility.md](./docs/compatibility.md) for the supported runtime matrix.
See [deploy/azure/README.md](./deploy/azure/README.md) for Azure deployment and probes.
See [SECURITY.md](./SECURITY.md) for private reporting and production requirements.
See [the latest security audit](./docs/security/SECURITY_AUDIT_2026-07-19.md) for findings, fixes and residual risks.

## SQLite CRUD reference

The second example exercises a realistic cross-runtime flow: C# loads records
from SQLite for SSR, TypeGen produces the React contracts, and the hydrated UI
creates, updates and deletes records through ASP.NET Core endpoints.

```powershell
npm run generate -w @rafagouveia/dotreact-example-crud
npm run dev -w @rafagouveia/dotreact-example-crud
```

Open `http://127.0.0.1:5090`. It uses renderer port `5174`, so it can run beside
the starter on ports `5080`/`5173` while retaining independent Fast Refresh.
