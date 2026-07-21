# Architecture and runtime ownership

## Working surface

The default editor view is intentionally smaller than the repository on disk.
Application developers normally work in `app/`, `Server/`, `public/`,
`package.json` and the server project file. Generated contract
artifacts, framework-owned frontend entrypoints, compiler configuration, deployment assets and
the pinned runtime are framework-owned and hidden by focus mode.

Use `dotreact workspace reveal` only when the task explicitly concerns advanced
build or deployment configuration. `dotreact workspace focus` restores the
normal application view. The files remain versioned in both modes.

Hydration, the development diagnostics overlay, the root error boundary and
route-level fallback modules belong to the DotReact runtime. Do not recreate
them in application bootstrap code. A project declares a boundary file only
when it intentionally wants to override the framework fallback.

`DotReact.Hosting` is the default ASP.NET Core composition facade. It owns
renderer lifecycle, discovery, Server Actions, Redis opt-in, images, security,
OpenTelemetry and production route mapping. `Program.cs` remains visible as the
application extension point for authentication, authorization, application
services and custom middleware. Apply `UseDotReactApplication()` before
authentication/authorization and call `MapDotReactApplication()` after custom
endpoint mappings so framework middleware and fallback ordering remain correct.

## Processes and trust boundaries

DotReact uses ASP.NET Core as the public process and a private Node renderer for
React SSR. The renderer receives a versioned module ID, URL and serializable
props. It does not receive application services, database connections, secrets
or arbitrary filesystem paths.

```text
Browser
  | HTTP, cookies, auth
  v
ASP.NET Core host
  | validated renderer protocol on loopback/private network
  v
Node React renderer
```

ASP.NET Core owns endpoint routing, authentication, authorization, antiforgery,
validation, use cases, persistence, cache policy, observability and the final
HTML document. The renderer owns only React module loading and rendering.

In development, Vite serves the client entry and React Refresh. `dotnet watch`
runs the ASP.NET host. In production, ASP.NET supervises the private renderer,
serves built client assets and exposes health endpoints.

## Optional application layers

DotReact does not prescribe the internal layout of `Server/`. For non-trivial
products, the following dependency direction is a recommended SOLID option:

```text
Presentation -> Application -> Domain
      |              ^
      +------> Infrastructure
```

- Domain: entities, value objects and invariants; no framework or persistence
  dependency.
- Application: focused use cases and application-owned ports.
- Infrastructure: EF Core, Redis, storage, queues, clocks and external clients.
- Presentation: DotReact loaders/actions, Minimal APIs, mapping and policies.
- Composition root: `Server/Program.cs` and focused registration extensions.

Do not create an interface for every class. Introduce an interface for a real
external capability or meaningful substitution. Do not let loaders or actions
become broad services containing business rules.

## Repository ownership

Next.js permits either `app/` or optional `src/app/`. DotReact deliberately uses
root `app/` only; `src/` is reserved for generated C# ↔ TypeScript boundary
artifacts. This keeps the C# source generator, Vite, SSR and hydration on one
canonical module tree.

- `app/`: file-routed DRX views, co-located server-only C# page loaders,
  `_components` presentation and `_actions/*.server.cs` Server Actions.
- `Server/`: application-owned C# structure and host code. DotReact does not
  require Domain/Application/Infrastructure folders.
- `app/_components/`: shared application UI and domain-neutral primitives.
- `app/<route>/_components/`: route-private UI and browser interaction.
- `app/_actions/` or `app/<route>/_actions/`: thin C# Server Action adapters.
- `src/contracts.ts`, `src/actions.ts`, `src/backend-manifest.json`: generated.
- `vendor/`: vendored DotReact runtime snapshot. Application work must not
  modify it.
- `deploy/azure/`: deployment infrastructure.
- `docs/ai/`: mandatory context for coding agents.

Run `dotreact architecture` after reorganizing files. Strict mode enforces the
`app/` presentation contract and rejects React UI in `src/features` or
`src/components`. Server Actions and ASP.NET static assets may use an
application-owned `Server/` layout; the CLI reports convention advice without
failing the build.

If a framework bug is discovered in a generated application, reproduce and fix
it in the DotReact framework repository, then upgrade the vendored snapshot.
Do not hide framework forks inside product code.

## Startup order

The application registers DotReact, discovery, security and optional services
before `Build()`. Middleware order is security-sensitive:

```csharp
app.UseDotReactSecurityHeaders();
app.UseAuthentication();       // when identity is configured
app.UseAuthorization();
app.UseDotReactStaticFiles();
app.UseRateLimiter();           // production when configured

app.MapDotReactHealthChecks();
app.MapDotReactPages();
app.MapDotReactActions();
app.MapDotReactImages();
app.MapDotReactFallback();
```

Do not copy this blindly: authentication services and middleware must be paired,
and fallback mapping must remain after more specific application endpoints.

## Stable and experimental boundaries

Stable application work uses DRX, classic/streaming SSR, hydration, client
navigation, C# Server Actions, prerendering and ASP.NET facilities. RSC/Flight is
an isolated experimental track and is not part of the stable DRX contract. Never
introduce `"use server"` JavaScript actions into a stable application.
