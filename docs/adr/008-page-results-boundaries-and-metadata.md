# ADR 008 — Page results, boundaries and metadata

## Status

Accepted.

## Context

Page loaders need to express HTTP outcomes without giving React ownership of
routing or backend policy. React also needs route-local not-found/error UI and
document metadata while keeping hydration deterministic and HTML injection
closed by default.

## Decision

- C# page loaders may return `DotReactPageResult<TProps>` with page, not-found
  or redirect outcomes. ASP.NET Core remains authoritative for status and headers.
- `not-found.drx` and `error.drx` are optional override files, excluded from the routable
  page registry and resolved from the nearest route ancestor.
- Boundary props use the fixed framework contract `statusCode`, `requestId` and
  optional `message`; the semantic checker rejects incompatible signatures.
- The render protocol carries a nullable boundary discriminator so SSR and
  hydration select the same component tree.
- When an override is absent, the virtual module supplies the corresponding
  framework-owned loading, not-found or error fallback. Generated applications
  do not carry copies of core boundary components.
- Page modules expose structured metadata. The SSR entry converts only known
  title, meta and link fields to escaped React elements; arbitrary head HTML is
  not accepted.
- Discovered server actions accept JSON and antiforgery-validated form posts.
  A local `_dotreact_return` path enables progressive redirects after success.

## Consequences

Native redirects and status codes work without client JavaScript, errors retain
correlation IDs, and special UI remains ordinary TSX with Fast Refresh. Adding a
new metadata field requires an explicit protocol/API change. File uploads remain
explicit ASP.NET endpoints rather than implicit action binding.
