# Development workflow and implementation recipes

## First checkout

```powershell
npm install
npm exec -- dotreact doctor
npm run check:contracts
npm run typecheck
npm run dev
```

The local app is normally at `http://127.0.0.1:5080`. The public process is
ASP.NET; the renderer port is private infrastructure.

## Add a page

Prefer the CLI to create collision-safe files:

```powershell
npm exec -- dotreact generate page invoices/[id]
```

Then:

1. Define the public props record in C#.
2. Implement the generated/discovered C# loader module.
3. Call an Application use case; do not query EF from the loader.
4. Implement the matching `page.drx` with `definePage<TProps>`.
5. Add authorization metadata to the loader.
6. Run `npm run generate` and update generated diffs.
7. Test normal, invalid route, unauthorized, not-found and error outcomes.

## Add a Server Action

```powershell
npm exec -- dotreact generate action CreateInvoice
```

Then:

1. Define request/response presentation records.
2. Add an explicit policy and resource authorization when needed.
3. Validate in C# and call one focused use case.
4. Return structured action results and exact revalidation paths.
5. Mark retryable high-impact mutations idempotent.
6. Run generation and import only the generated function in React.
7. Test CSRF, unauthenticated, forbidden, validation, success, replay,
   conflict and cache invalidation behavior.

## Add a layout or boundary

```powershell
npm exec -- dotreact generate layout invoices
npm exec -- dotreact generate boundary invoices --kind loading
npm exec -- dotreact generate boundary invoices --kind error
npm exec -- dotreact generate boundary invoices --kind not-found
```

Keep layouts free of hidden backend access. Boundaries must be accessible,
deterministic and safe for production error disclosure.

## Change a contract safely

1. Change the compiled C# source, not generated TypeScript.
2. Run `npm run generate`.
3. Inspect `contracts.ts`, `actions.ts` and manifest diffs.
4. Update every typed React consumer.
5. Run `npm run check:contracts` to prove generation is stable.
6. Test SSR serialization and browser hydration with representative nulls,
   enum/date/decimal/large-ID values.

## Decide where code belongs

```text
Business invariant?                 Domain
Application operation/use case?     Application
Database/external provider?          Infrastructure
HTTP/loader/action mapping?          Presentation/Server
Route view or page loader?           app
Reusable product interaction?        src/features
Generic visual component?            src/components
Generated boundary?                  generated files; never hand-edit
Framework defect?                    upstream framework repository
```

## Required gates

During development, run the smallest focused tests. Before handoff:

```powershell
npm run generate
npm run check:contracts
npm run typecheck
npm run build
npm audit --audit-level=high
```

Run C# unit/integration/architecture tests for backend changes and browser tests
for navigation, hydration or interaction changes. A runtime smoke should verify:

- HTTP 200 or the intended status;
- meaningful text exists in server HTML before JavaScript;
- `__DOTREACT_DATA__` exists and contains the matching module/props;
- CSP exists and hydration runs without console mismatch;
- an action passes CSRF/auth, persists, revalidates and survives refresh;
- dev processes are stopped after automated smoke tests.

## Review checklist for agents

- Did I read every mandatory AI document?
- Did I keep C# authoritative and React presentational?
- Did I accidentally edit generated or vendored framework files?
- Do the C# module ID and DRX path match exactly?
- Is the initial render deterministic?
- Are authorization, validation, cancellation and not-found states tested?
- Are money/decimal/large integer values transported safely?
- Are action replay and revalidation correct?
- Did I run and report the relevant gates honestly?
