# DotReact starter

## Repository setup

The scaffold is ready to become a repository but deliberately does not run
`git init`. It includes `.gitignore`, `.gitattributes`, `.editorconfig`,
`.dockerignore`, pinned Node/.NET expectations, shared build rules, VS Code recommendations
and a GitHub Actions quality/container workflow. Run `npm install` before the
first commit and commit the generated `package-lock.json` for reproducible CI.

This app uses ASP.NET Core for backend page loaders and React for SSR and browser
hydration.

```powershell
npm install
npm run dev
```

Projects created during the pre-release vendor the CLI too, so project-local
commands work without a global installation:

```powershell
npm exec -- dotreact doctor
npm exec -- dotreact generate page catalog/[slug]
npm exec -- dotreact check
```

Open `http://127.0.0.1:5080`.

Key files:

- `Server/Pages/Home/page.drx.cs` is the C# loader for `/`.
- `Server/Pages/Products/ById/page.drx.cs` loads the dynamic
  `/products/{id:int}` route.
- `src/pages/**/page.drx` contains the React SSR/hydration views.
- `src/pages/**/not-found.drx` and `error.drx` are the nearest route boundaries.
- `src/pages/layout.drx` wraps every page; nested directories can add their own
  `layout.drx`, composed from root to leaf.
- `Server/Actions/IncrementDemoAction.cs` is an explicitly exposed C# server
  action with authorization metadata and antiforgery protection.
- `src/contracts.ts`, `src/actions.ts` and `src/backend-manifest.json` are
  generated from the compiled C# application. Run `npm run generate` to update
  them or `npm run check:contracts` to detect drift.

Use `/products/7` for dynamic SSR, `/products/404` for the not-found result,
`/products/500` for the error boundary and `/products/302` for a redirect. Page
modules may export `metadata` or a typed metadata resolver; DotReact serializes
only supported title/meta/link fields into the document head.

The starter associates `*.drx` with TypeScript React in VS Code. In another
editor, associate `.drx` with TSX to get the same highlighting and language
features. `npm run typecheck` additionally checks `.drx` semantics, page props,
layout signatures and drift against `src/backend-manifest.json`. DRX does not
execute C# inside JSX; typed props and server actions are the language boundary.

The `framework/` directory exists in projects created before DotReact's first
npm/NuGet release. Do not edit it as application code; it will become pinned
package dependencies once the public packages are available.

The one-argument page attribute derives routing from the DRX module ID:

```csharp
[DotReactPage("products/[id]/page")] // /products/{id}
```

Use the two-argument overload when ASP.NET constraints are required. Generated
projects include a production Dockerfile for Azure App Service or Azure
Container Apps. ASP.NET exposes port 8080 and supervises the private Node SSR
renderer; use `/_health/live` and `/_health/ready` for platform probes.

Production enables a strict CSP/security-header baseline and per-instance Server
Action rate limiting. The generated HTML and action responses are `no-store`;
fingerprinted assets are immutable while stable asset names are revalidated.

The host registers OpenTelemetry for ASP.NET Core, HTTP, DotReact renderer and
Server Actions. Set `OTEL_EXPORTER_OTLP_ENDPOINT` to send traces and metrics to an
OTLP collector; without it, no exporter connection is attempted.

For an action that can be retried safely, add `[DotReactIdempotent]`, send a
stable `idempotencyKey` from the generated client call, and return local paths
through `DotReactActionResult.Success(value, revalidatePaths)` when consumers
need a revalidation signal. The default store is bounded and process-local.

The framework CLI exposes the same lifecycle in every generated project:

```powershell
dotreact doctor
dotreact generate page catalog/[slug] --dry-run
dotreact sync
dotreact check
dotreact build
dotreact analyze
dotreact benchmark http://127.0.0.1:5080/
dotreact start
```
