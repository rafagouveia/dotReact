# ADR 005: DRX pages and explicit C# server actions

## Status

Accepted for the first opt-in vertical slice.

## Decision

`.drx` files contain ordinary TypeScript React syntax. They do not embed or
evaluate C#. A companion C# presentation class implements `IDotReactPage<T>`
and carries an explicit `[DotReactPage(pattern, moduleId)]` attribute. ASP.NET
Core owns routing, authorization, loading and HTTP behavior; React owns only SSR
and hydration.

Server actions are closed classes implementing `IDotReactAction<TRequest,
TResponse>` and carrying a stable `[DotReactAction(id)]`. Public methods are
never exposed by convention. Actions are authorized by default; an action must
use `[AllowAnonymous]` to opt out. Every call is POST-only and validates an
ASP.NET Core antiforgery token sent in `X-DotReact-CSRF`.

TypeGen discovers annotated page/action contracts from the compiled application
and emits three deterministic artifacts: TypeScript contracts, typed action
clients and a backend manifest. The existing explicit TypeGen and
`MapDotReactPage` APIs remain supported.

The Vite plugin scans only `src/pages/**/*.drx`, resolves canonical paths,
rejects a pages root outside the application, ignores escaping symlinks and
builds `virtual:dotreact/pages` from static imports. Request data is never used
to construct a filesystem path or import specifier.

## Editor support

Because DRX is TSX, VS Code can use its built-in TypeScript React language
service. The starter includes a `files.associations` entry and the repository
contains an extension manifest under `editors/vscode-dotreact`. Other editors
can associate `*.drx` with TSX.

Cross-language navigation requires a dedicated language server and remains a
follow-up milestone. Build-time semantic checking is provided by
`dotreact-check`; Vite provides syntax transformation, source maps, HMR and
production bundling.

## Consequences

- The backend remains exclusively C#.
- Props/actions cross the runtime boundary only as generated typed JSON.
- Dynamic routes use ASP.NET Core constraints and conversion.
- Existing projects can adopt DRX/actions independently.
- Route inference from filesystem paths and a full LSP are not implied by this
  first slice. Layouts were specified separately in ADR 006.
