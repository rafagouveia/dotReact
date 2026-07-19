# ADR 006: DRX layouts and semantic checking

## Status

Accepted for the second opt-in DRX slice.

## Decision

A file named exactly `layout.drx` applies to pages in its directory and every
descendant. Layouts compose from the canonical pages root toward the leaf. They
are ordinary React components receiving `children`; they are not routable
pages, backend loaders or implicit server actions. The Vite registry statically
imports pages and layouts and constructs the same component tree for SSR and
browser hydration.

Production builds and project type checks use `dotreact-check`. The command
opens each `.drx` source as a virtual TSX document in the TypeScript compiler,
requires pages to match their manifest-derived generated props type, requires
layouts to accept React children and runs with `noEmit`. Diagnostics map back to
root-relative `.drx` paths.

When a backend manifest is configured, page validation is a bijection: every
C# page module must have one `.drx` page and every `.drx` page must have one C#
registration. Duplicate/case-colliding module IDs, malformed manifests,
escaping symlinks, roots outside the project and excessive input sizes fail
closed. Request values never select files or imports.

## Consequences

- Layout behavior is deterministic and does not depend on request data.
- Contract drift fails before deployment instead of becoming an SSR error.
- `.drx` remains standard TSX and keeps existing editor tooling.
- Cross-language navigation and refactoring still require a future dedicated
  language server.
- Filesystem route inference, error boundaries and status files are separate
  design decisions.
