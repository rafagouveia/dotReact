# DotReact CRUD example

This example intentionally uses the manual TypeScript page registry to prove
compatibility with conventional `.tsx` applications. New file-routed projects
should normally prefer `page.drx`, discovered loaders and the generated manifest
shown by the starter example.

This example exercises the C# ↔ React boundary with a persistent SQLite work
board. ASP.NET Core owns validation, persistence, timestamps and the API. React
receives the first page as generated typed props through SSR, hydrates it, and
then performs same-origin CRUD operations against C# endpoints.

```powershell
npm install
npm run generate -w @dotreact/example-crud
npm run dev -w @dotreact/example-crud
```

Open `http://127.0.0.1:5090`.

## SOLID architecture

The server is split into projects so dependency direction is enforced by the
compiler instead of relying only on folder conventions:

```text
Presentation / Server  ->  Application  ->  Domain
          |                    ^
          +------------> Infrastructure
```

- `Server/Domain` owns the `WorkItem` entity, its state changes and
  normalization rules. It has no ASP.NET Core or EF Core dependency.
- `Server/Application` owns one use case per operation, input validation,
  mapping and small persistence/time ports. It references only Domain.
- `Server/Infrastructure` implements those ports with EF Core, SQLite and the
  system clock.
- `Server/Presentation` translates HTTP requests and use-case results. It does
  not access `DbContext` or contain business rules.
- `Server/Composition` is the single dependency-injection composition root.

To add behavior, start with a focused use case in `Application/UseCases`. Add a
small application-owned interface only when the behavior needs an external
capability, then implement that interface in `Infrastructure` and register it
in `Composition`. HTTP and React code remain adapters around that application
flow.

`Server.Tests/ArchitectureTests.cs` guards the inward dependency direction.
`ApplicationUseCaseTests.cs` exercises business behavior with in-memory port
implementations, while `WorkItemsApiTests.cs` verifies the complete HTTP and
SQLite flow.

## What this proves

- The initial list and statistics are loaded from SQLite in C# and included in
  React's server-rendered HTML.
- `DashboardProps`, request records, DTOs and enum unions are generated from the
  compiled C# assembly into `src/contracts.ts`.
- The hydrated React form calls same-origin ASP.NET Core POST/PUT/DELETE routes.
- C# remains responsible for validation, normalization, timestamps and database
  writes; React updates the local board after each typed response.
- The renderer owns an isolated HMR websocket, so this example can run beside the
  simple starter without losing Fast Refresh state.

Useful checks:

```powershell
npm run check:contracts -w @dotreact/example-crud
npm run typecheck -w @dotreact/example-crud
dotnet test examples/crud/Server.Tests/Server.Tests.csproj
```

The development database is created under `Server/App_Data/` and is intentionally
ignored by source control. Delete that database only when you explicitly want a
fresh local seed.

This is a local reference application, not an authentication template. Before
using the endpoints in a production application, add user authentication,
resource-level authorization, antiforgery protection for cookie-authenticated
mutations, EF migrations, concurrency tokens and an application backup policy.
