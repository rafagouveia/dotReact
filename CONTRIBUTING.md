# Contributing to DotReact

Thank you for helping improve DotReact. The project welcomes bug fixes,
documentation, tests, accessibility improvements, performance work and focused
framework capabilities. Start with a small, reviewable change and explain the
problem it solves.

## Before opening work

- Search existing issues and pull requests to avoid duplicate work.
- Use a public issue for bugs and proposals that contain no sensitive details.
- Follow [SECURITY.md](SECURITY.md) for vulnerabilities. Never publish an
  exploit, credential, customer data or working proof of concept in an issue.
- Discuss large public API, protocol or routing changes before implementing
  them. These surfaces carry compatibility and migration obligations.

## Local setup

Use Node.js 24 for the repository workflow and .NET SDK 10. Clone your fork,
create a focused branch, and install both dependency trees:

```powershell
npm ci
npm ci --prefix docs
dotnet restore dotnet/DotReact.slnx
dotnet restore examples/crud/Server.Tests/Server.Tests.csproj
```

Do not commit generated output from `dist/`, test artifacts, databases, secrets
or local environment files.

## Architecture rules

Every change follows [AGENTS.md](AGENTS.md). In particular:

- Domain stays independent from ASP.NET Core, EF Core, React, Vite and JSON.
- Application owns focused use cases and only the narrow ports they need.
- Infrastructure implements those ports.
- Loaders, Server Actions and HTTP endpoints authorize, validate, call one use
  case and map its result; business rules do not live in Presentation.
- `.drx` is trusted TSX. It consumes generated props and action clients but does
  not embed or evaluate C#.
- Do not introduce generic repositories, broad service classes, service
  locators or abstraction layers without a concrete volatility boundary.

Tests should prove behavior rather than mirror implementation. A persistence
change covers validation, success, not-found behavior, isolation and a database
separate from development data. A C# ↔ TypeScript change also verifies generated
contracts and manifest consistency.

## Documentation changes

Portuguese is the primary authoring language and English must keep structural
parity. When rich content changes:

```powershell
npm --prefix docs run validate:content
node docs/scripts/generate-english-catalog.mjs
npm --prefix docs run validate:translations
npm --prefix docs run build
```

Review generated English wording before committing it. Examples must teach the
same SOLID structure that the starter generates and must not expose secrets,
unsafe authentication shortcuts or development-only defaults as production
guidance.

## Quality gate

Run targeted checks while developing. Before opening a pull request, run:

```powershell
npm run verify
npm run package:vsix -w dotreact-vscode
```

The complete gate builds tooling and docs, checks both starter contracts, runs
TypeScript and .NET tests, validates dependency advisories and packages the VS
Code extension. A live Redis test remains opt-in and requires
`DOTREACT_TEST_REDIS`.

## Commits and pull requests

- Write commit messages in English and keep each commit cohesive.
- Prefer `feat/`, `fix/`, `docs/`, `refactor/` or `test/` branch prefixes in a
  personal fork.
- Describe what changed, why it changed, public compatibility impact and how it
  was verified.
- Include migration notes for public API, configuration, schema, CLI or protocol
  changes.
- Add tests for behavior changes and update both documentation languages when
  users need to act differently.
- Keep unrelated formatting or generated changes out of the pull request.

Maintainers may ask for a change to be split when it crosses unrelated
responsibilities or makes compatibility review difficult.

## License and contributor credit

By submitting a contribution, you confirm that you have the right to provide it
and agree that it is licensed under the repository's
[PolyForm Noncommercial License 1.0.0](LICENSE). Keep existing copyright,
license and [required notice](NOTICE) text intact.

The repository is public and welcomes pull requests, but it is source-available
rather than OSI-approved open source. The license permits study, modification
and redistribution for noncommercial purposes. Commercial use requires separate
written permission from Black Red Solutions. Releases through `0.1.4` retain
the MPL 2.0 rights under which they were originally distributed.
