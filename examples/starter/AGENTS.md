# DotReact application instructions

These instructions apply to the entire repository and are mandatory for coding
agents, including Codex Cloud.

## Required reading

Before changing application code, read the following files completely and in
this order:

1. `docs/ai/PROJECT.md`
2. `docs/ai/DOTREACT.md`
3. `docs/ai/01-ARCHITECTURE.md`
4. `docs/ai/02-DRX-ROUTING.md`
5. `docs/ai/03-SSR-HYDRATION.md`
6. `docs/ai/04-DATA-ACTIONS-SECURITY.md`
7. `docs/ai/05-CACHING-PRODUCTION.md`
8. `docs/ai/06-WORKFLOW-RECIPES.md`
9. `docs/ai/07-SOLID-FEATURES.md`
10. `docs/ai/08-AUTHENTICATION-SESSIONS.md`

These files are the project-local framework specification. Do not infer
DotReact behavior from Next.js, Razor, Blazor or a similarly named library. If
documentation and executable code disagree, stop, identify the mismatch and
verify the behavior in framework tests before changing application code.

## Non-negotiable rules

- ASP.NET Core is the only backend and owns HTTP, authentication, authorization,
  validation, domain behavior, persistence and secrets.
- React owns presentation and browser interaction. Do not create a second Node
  backend or move domain rules into React components.
- A `.drx` file is ordinary React TypeScript/TSX compiled by the DotReact Vite
  plugin. It is not Razor and cannot execute or embed C# expressions.
- C# to React "interpolation" happens through serialized, generated page props.
  React to C# communication happens through generated typed Server Actions.
- Never edit `src/contracts.ts`, `src/actions.ts` or
  `src/backend-manifest.json` by hand. Run `npm run generate` after changing a
  public C# loader, action or presentation contract.
- Keep page modules thin. Put backend loading in C# page loaders and reusable UI
  behavior under `src/features` or `src/components`.
- Keep Domain independent from ASP.NET Core, EF Core, React and serialization.
  Keep endpoints/loaders/actions as adapters around focused application use
  cases.
- Do not edit the vendored `vendor/` directory for application features.
  It is the local framework runtime snapshot and may be replaced by a future
  DotReact upgrade.
- Treat every Server Action and route as a security boundary. Apply explicit
  authorization policies and validate input in C#. Anonymous access must be a
  deliberate, reviewed decision.
- Keep browser authentication in an `HttpOnly` cookie. Never place session IDs,
  access tokens or refresh tokens in DRX props, hydration, Web Storage or logs.
- Authentication use cases verify identity through application-owned ports;
  only Presentation maps a successful result to `IDotReactSessionManager`,
  ASP.NET Core Identity or an external authentication handler.
- Preserve SSR and hydration equivalence: server and browser must render the
  same route module, layouts, boundaries and initial props.
- Import modular CSS from its owning DRX/layout/component. Keep only reset,
  tokens and document defaults in `src/styles.css`; declare local fonts in
  `app/fonts.ts` with `@dotreact/font`. DotReact promotes
  route CSS into the SSR head before first paint.

## File ownership map

- Maintain routes in `app/`: each `page.drx` may have a co-located
  `page.server.cs`. Keep domain, application, infrastructure and global actions
  under `Server/`; keep shared React code under `src/features` and
  `src/components`.
- Put application fonts, icons and images in `public/`. Do not author assets in
  `Server/wwwroot`; that is a framework deployment detail.
- Treat `src/contracts.ts`, `src/actions.ts` and
  `src/backend-manifest.json` as generated output. Never edit them manually.
- Treat `vendor/` as an opaque, pinned runtime. It is hidden from normal VS Code
  browsing and search; application work must never modify it.
- Change root configuration files only when the application runtime, build or
  deployment behavior genuinely changes. Do not place business rules there.
- The workspace starts in focused mode. Do not reveal or edit hidden
  infrastructure merely to implement an application feature. Use
  `dotreact workspace reveal` only for an explicit deployment or advanced
  tooling change, and restore `dotreact workspace focus` afterward.
- Extend the C# host around `AddDotReactApplication()`,
  `UseDotReactApplication()` and `MapDotReactApplication()`. Do not copy the framework's renderer, Redis,
  security, image or observability composition back into `Program.cs`.

## Required validation

Run the smallest relevant checks while developing and all of these before
handing off a behavioral change:

```powershell
npm run generate
npm run typecheck
npm run check:contracts
npm run build
```

Run backend tests when domain, application, loader, action, authorization or
persistence code changes. Report any check that could not run; never silently
claim compatibility.
