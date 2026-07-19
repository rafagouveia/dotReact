# DotReact

DotReact is an experimental full-stack framework that keeps ASP.NET Core in
charge of HTTP, authentication, services, and data while React renders the UI
on the server and hydrates it in the browser.

This repository contains a reusable pre-release framework, CLI scaffold and two
reference applications. The runtime boundary and production lifecycle are
implemented; the public API remains version `0.1.0` until packages are published.
Public surfaces follow the repository's [compatibility and deprecation policy](COMPATIBILITY.md).

## What works now

- ASP.NET Core page loaders returning typed C# props.
- Typed invariant route and scalar query-string values in page loaders.
- Versioned JSON transport to an internal Node renderer.
- React 19 server rendering through Vite.
- Safe hydration payload and browser hydration.
- Deterministic C# to TypeScript contract generation with a drift check.
- Opt-in `.drx` pages compiled as TSX with a static Vite page registry.
- Root and nested `layout.drx` composition shared by SSR and hydration.
- Semantic `.drx` type checking and frontend/backend manifest validation.
- Opt-in file route convention shared by C#, TypeGen and the Vite checker.
- Production client/SSR bundles, supervised Node rendering and Azure health endpoints.
- Discovered dynamic C# page loaders and typed C# server actions.
- Multi-assembly page/action discovery shared by runtime and TypeGen.
- Declarative page policies and resource-based Server Action authorization.
- Opt-in distributed loader-result caching with automatic action invalidation.
- Typed page results for success, redirects and not-found responses.
- Root/nested `not-found.drx` and `error.drx` boundaries with safe hydration.
- Structured page metadata rendered during SSR without accepting arbitrary HTML.
- JSON and progressive HTML-form binding for discovered server actions.
- Authorization-by-default and antiforgery protection for server actions.
- Opt-in idempotent actions, bounded replay, payload limits and revalidation signals.
- Closed generic contracts and precision-safe `decimal`/`long` string contracts.
- System.Text.Json polymorphic DTOs emitted as discriminated TypeScript unions.
- Strict production CSP/security headers and opt-in per-instance action rate limiting.
- OpenTelemetry traces/metrics with optional OTLP export from the starter.
- Safe static-asset caching, renderer keep-alive tuning and measurable bundle/SSR budgets.
- A reusable CLI with templates, generators, `sync`, `analyze` and `benchmark`.
- VS Code check-on-save diagnostics, project check command and loader CodeLens.
- Installable pre-release VSIX with a real VS Code extension-host test.
- Renderer health endpoint, correlation IDs, timeouts, and safe production errors.
- Bounded renderer restart supervision, graceful shutdown, token redaction and metrics.
- Azure App Service/Container Apps Bicep templates and cross-platform CI gates.
- TypeScript protocol tests and .NET integration tests.

Streaming, static generation, enhanced navigation and a full cross-language
language server remain post-MVP milestones.

## Run the included starter

Requirements: Node.js 20.19+ and .NET SDK 10.

```powershell
npm install
npm run build
npm run dev
```

Open `http://127.0.0.1:5080`. The initial HTML contains the value loaded in C#;
the counter proves that React hydrated the same tree in the browser.

## Create a project

From this repository:

```powershell
npm run build
npm run create -- create my-app
node packages/cli/dist/index.js create my-minimal-app --template minimal
cd my-app
npm install
npm run dev
```

Until the first npm/NuGet publication, generated projects vendor the small
framework runtime under `framework/`. This makes scaffolds executable now and
will be replaced by pinned package references at release time.

Scaffolds are repository-ready without creating a `.git` directory. They include
Git/editor line-ending rules, Node and .NET version expectations, Docker context
exclusions and a GitHub Actions workflow. Run `npm install` and commit the
resulting lockfile before the first push.

Inside a generated project, the complete lifecycle is:

```powershell
dotreact doctor
dotreact dev
dotreact generate page catalog/[slug]
dotreact generate action SaveCatalog
dotreact sync
dotreact check
dotreact build
dotreact analyze
dotreact benchmark http://127.0.0.1:5080/
dotreact start
```

`start` creates a self-contained `.dotreact/publish` layout, runs ASP.NET Core
as the public process and supervises the private production Node renderer.
Generators support `--dry-run`, reject paths that could escape the project and
never overwrite an existing file.

Set `OTEL_EXPORTER_OTLP_ENDPOINT` in the host to export ASP.NET Core, renderer
and Server Action traces/metrics over OTLP. No request props, tokens, request IDs
or URLs are used as telemetry labels.

## Page contract

The server owns the loader:

```csharp
app.MapDotReactPage("/", "app/page", (HttpContext context, CancellationToken token) =>
    ValueTask.FromResult(new HomePageProps("Hello from C#", DateTimeOffset.UtcNow)));
```

React consumes the equivalent generated TypeScript contract:

```tsx
export default function HomePage(props: HomePageProps) {
  return <h1>{props.message}</h1>;
}
```

C# expressions are deliberately not embedded in JSX. The integration boundary
is serialized generated props and explicitly exposed typed server actions. This
keeps C# authoritative for backend behavior while preserving ordinary React/TSX
tooling and Fast Refresh.

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
packages/protocol               shared renderer protocol for TypeScript
packages/renderer               private Node/Vite SSR sidecar
packages/client                 hydration and typed Server Action client
packages/vite                   .drx compiler, registry and semantic checker
packages/cli                    scaffold and diagnostics CLI
examples/starter                executable reference application
examples/crud                   SOLID SQLite CRUD reference application
editors/vscode-dotreact         VS Code diagnostics and loader CodeLens
deploy/azure                    App Service and Container Apps infrastructure
docs/adr                        architectural decisions
```

## Interactive documentation

The framework guide is also an interactive local application with searchable
navigation, paired C#/React examples, a route explorer and a CLI command builder.

```powershell
npm install --prefix docs
npm run docs:dev
```

Open `http://127.0.0.1:5100`. Validate the production documentation bundle with
`npm run docs:typecheck` and `npm run docs:build`.

## Quality commands

```powershell
npm run typecheck
npm test
npm run build
dotnet test dotnet/DotReact.slnx
npm audit
```

See [ROADMAP.md](./ROADMAP.md) for milestone scope and release gates.
See [docs/compatibility.md](./docs/compatibility.md) for the supported runtime matrix.
See [deploy/azure/README.md](./deploy/azure/README.md) for Azure deployment and probes.

## SQLite CRUD reference

The second example exercises a realistic cross-runtime flow: C# loads records
from SQLite for SSR, TypeGen produces the React contracts, and the hydrated UI
creates, updates and deletes records through ASP.NET Core endpoints.

```powershell
npm run generate -w @dotreact/example-crud
npm run dev -w @dotreact/example-crud
```

Open `http://127.0.0.1:5090`. It uses renderer port `5174`, so it can run beside
the starter on ports `5080`/`5173` while retaining independent Fast Refresh.
