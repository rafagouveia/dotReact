# ADR 014: Unified app router

## Status

Accepted and shipped in the 0.1.x scaffold. The legacy `src/pages` plus
attributed loader model remains a compatibility surface, but it is not generated
for new applications.

## Context

Keeping React routes under `src/pages` and C# page loaders under `Server/Pages`
made one DotReact page look like two unrelated features. It also required a
duplicated module ID attribute whose drift could only be detected after build.

DotReact still needs a strict trust boundary: C# owns HTTP, authorization,
business behavior and persistence; DRX remains ordinary TSX and must not parse
or evaluate embedded C#.

## Decision

New applications use one file-routed `app/` tree:

```text
app/
  layout.drx
  page.drx
  page.server.cs
  (operations)/
    reconciliations/
      page.drx
      page.server.cs
      _components/
```

- `page.drx` is the universal React view used for SSR and hydration.
- `page.server.cs` is the server-only C# loader and public props contract.
- a source generator derives the module ID and route from the physical path and
  emits assembly registration metadata at compile time;
- `(group)` folders organize code without adding a URL segment;
- `_private` folders are excluded from route discovery;
- `layout.drx`, `loading.drx`, `error.drx` and `not-found.drx` compose by physical
  ancestry, including route groups;
- `[DotReactPage]` remains an explicit escape hatch for constrained or externally
  defined ASP.NET patterns;
- shared application UI lives under `app/_components`; route-private UI lives
  under the nearest `app/**/_components`; Server Actions follow the equivalent
  `_actions/*.server.cs` convention. Domain, Application, Infrastructure and
  background jobs remain in the C# backend.

## Development updates

DRX/TSX/CSS changes use Vite Fast Refresh. Successful .NET Hot Reload updates
increment a generated application revision. The browser receives revision
updates on the same origin through one framework-owned WebSocket and asks the DotReact
router to refresh current server props in the background;
process restarts still cause a full document reload. No public HTML or script
depends on a localhost renderer or dotnet-watch WebSocket.

## Consequences

Route identity becomes compile-time metadata and ordinary requests do no source
scanning or mixed-language parsing. A public props shape change still regenerates
the C#/TypeScript contract; method-body and value changes do not rewrite
unchanged generated artifacts. Route groups can collide at the URL layer, so
startup rejects duplicate patterns. Private folders cannot contain pages.
