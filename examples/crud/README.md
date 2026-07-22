# DotReact CRUD reference

This is the complete reference application for the current DotReact architecture.
It exercises the same path a generated application uses: file-routed DRX pages,
discovered C# loaders, generated contracts, React SSR and hydration, typed Server
Actions, automatic route revalidation, authorization, and SQLite persistence.

```powershell
npm install
npm run generate -w @blackredsolutionsteam/dotreact-example-crud
npm run dev -w @blackredsolutionsteam/dotreact-example-crud
```

Open `http://127.0.0.1:5090`.

## Request and mutation flow

```text
GET /
  -> page.drx route
  -> WorkItemsPage C# loader
  -> SQLite use case
  -> generated DashboardProps
  -> React SSR
  -> browser hydration

Create, update or delete
  -> generated TypeScript action
  -> authorized C# Server Action
  -> application use case
  -> SQLite
  -> automatic revalidation of /
```

The React route is `app/page.drx`; it is intentionally thin and delegates
the interactive UI to `app/_components/work-items/WorkItemsBoard.tsx`. The matching
C# loader is co-located at `app/page.server.cs`. Server Actions
live under `app/_actions/work-items` and are exposed to React through generated
`src/actions.ts` functions.

## SOLID architecture

The backend is split into projects so the compiler enforces dependency direction:

```text
Presentation / Server  ->  Application  ->  Domain
          |                    ^
          +------------> Infrastructure
```

- `Server/Domain` owns the entity and its state transitions, with no ASP.NET Core
  or EF Core dependency.
- `Server/Application` owns focused use cases, validation and only the ports that
  cross an actual infrastructure boundary.
- `Server/Infrastructure` implements persistence and time using EF Core, SQLite
  and the system clock.
- `app/page.server.cs`, `app/_actions` and `Server/Presentation` adapt framework or
  HTTP requests into application use cases. They do not access `DbContext`.
- `Server/Composition` is the dependency-injection composition root.
- `app/_components` contains client interaction; `app` also contains route,
  layout, loading, error and not-found boundaries. `src` is generated only.

The REST endpoints under `/api/work-items` remain only as a Minimal API route
handler interoperability example. The DotReact UI does not use them; it uses the
generated Server Actions.

## Generated boundary

Run `npm run generate -w @blackredsolutionsteam/dotreact-example-crud` after changing a public loader,
action or presentation contract. It regenerates:

- `src/contracts.ts`: C# records, DTOs and enum unions as TypeScript types;
- `src/actions.ts`: typed action callers;
- `src/backend-manifest.json`: discovered page and action metadata.

`npm run check:contracts -w @blackredsolutionsteam/dotreact-example-crud` is the non-mutating CI guard
that fails when these artifacts are stale.

## Security model

The page, Server Actions and REST handlers all require the `work-items.access`
policy. For this local example, a demo authentication handler is enabled only in
`Development` and `Testing`. It deliberately fails closed in `Production`.

Before deploying an application based on this example, replace demo
authentication with the real identity provider, define resource-level policies,
configure secrets outside source control, use EF migrations and adopt backup and
concurrency policies. `/health` is intentionally public for platform probes.

## Validation

```powershell
npm run check:contracts -w @blackredsolutionsteam/dotreact-example-crud
npm run typecheck -w @blackredsolutionsteam/dotreact-example-crud
npm run build -w @blackredsolutionsteam/dotreact-example-crud
dotnet test examples/crud/Server.Tests/Server.Tests.csproj -c Release
```

The test suite covers application behavior, architecture boundaries, discovered
pages, action authorization and CSRF, REST interoperability, SQLite CRUD, and
the production fail-closed behavior.

The development database is stored under `Server/App_Data/` and ignored by Git.
Delete it only when you explicitly want a fresh local seed.
