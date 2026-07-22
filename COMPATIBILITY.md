# DotReact compatibility and deprecation policy

This policy applies to the public DotReact framework surface. It starts with
version `0.1.0` even while packages remain locally vendored and unpublished.

## Version model

DotReact uses Semantic Versioning (`MAJOR.MINOR.PATCH`) across coordinated npm,
NuGet, CLI and VS Code extension artifacts.

- `PATCH` fixes defects and security issues without intentionally breaking a
  documented public contract.
- `MINOR` adds backward-compatible features. During the `0.x` preview, a minor
  release may contain a necessary breaking change only when it is documented,
  has a migration path and cannot reasonably be introduced additively.
- `MAJOR` is required for intentional breaking changes after `1.0.0`.

All artifacts built from a release use the same framework version. Renderer
protocol and manifest schema versions are independent integers because they
may require explicit negotiation even when package APIs remain compatible.

## Public compatibility surfaces

The following are public contracts:

1. Public C# types and members under `DotReact.AspNetCore` and the
   convention-based `DotReact.Hosting` application facade.
2. Exported TypeScript APIs from `@blackredsolutionsteam/dotreact-client`, `@blackredsolutionsteam/dotreact-protocol`,
   `@blackredsolutionsteam/dotreact-renderer`, `@blackredsolutionsteam/dotreact-vite`, `@blackredsolutionsteam/dotreact-image`, `@blackredsolutionsteam/dotreact-adapter`
   and the explicitly experimental `@blackredsolutionsteam/dotreact-rsc` surface.
3. Public C# members in the optional `DotReact.Redis` and `DotReact.Images.SkiaSharp` plugins.
4. CLI command names, documented options, exit-code semantics and generated
   project layout.
5. `.drx` file conventions, canonical module IDs and route inference.
6. Renderer protocol envelopes and backend/prerender-manifest schemas.
7. Documented configuration keys, environment variables, headers and health
   endpoint paths.
8. Generated TypeScript naming and serialization behavior documented as stable.

Implementation classes marked `internal`, files under `dist`, `bin`, `obj` or
`.dotreact`, generated bundle names and undocumented diagnostics text are not
compatibility contracts.

### App-router transition

The `app/**/page.drx` plus optional `page.server.cs` convention is the default
for new 0.2-development projects. Legacy `src/pages` discovery and explicit
`[DotReactPage]` loaders remain supported as a compatibility mode for at least
the normal 0.x deprecation window. Route groups, private folders and generated
`routing: "app"` manifests are part of the public file-convention surface.

## Breaking-change rules

Removing or renaming a public member, changing a parameter or return type,
tightening a previously valid input, changing serialized JSON, altering route
inference or changing a successful CLI exit to failure is breaking unless the
old behavior was an acknowledged security vulnerability.

Additive members, new optional manifest fields, new opt-in attributes and new
CLI commands are normally compatible. New secure defaults that affect behavior
must ship behind an option when existing applications could otherwise break.

Protocol readers must reject unknown required protocol versions. Optional
fields may be added within a protocol version only when old readers safely
ignore them. Required or semantic envelope changes increment the protocol.

## Deprecation lifecycle

1. Introduce the replacement before deprecating the old API.
2. Mark C# APIs with `ObsoleteAttribute`, TypeScript APIs with `@deprecated`,
   and CLI behavior with a bounded warning on stderr.
3. Document the reason, replacement and earliest removal version in the
   changelog and migration notes.
4. Preserve deprecated APIs for at least one minor release during `0.x`.
   After `1.0`, preserve them for at least two minor releases or 90 days,
   whichever is longer, unless an active security issue requires faster action.
5. Remove only in a permitted breaking release.

Security fixes may bypass the normal window when preserving behavior would keep
users exposed. Such changes require a security advisory, explicit changelog
entry and the smallest practical migration.

## Release gates

Every release candidate must pass:

- deterministic TypeGen generation and drift checks;
- .NET and TypeScript public builds and tests;
- clean generated-project install, typecheck and production build;
- renderer protocol and backend-manifest compatibility tests;
- VSIX packaging plus a real VS Code extension-host test;
- dependency audit, container build and infrastructure validation.

After the first published NuGet baseline, package validation/API compatibility
must compare each release with the latest stable version. Publishing remains an
external gate and is not implied by this policy.

## Exceptions

Any exception must be recorded in the changelog with affected surfaces,
rationale, migration steps and rollback guidance. Silent breaking changes are
not accepted.
