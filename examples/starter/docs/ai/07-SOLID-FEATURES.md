+# SOLID, use cases and feature organization

## Dependency rule

Application code follows one inward dependency direction:

```text
app/page.server.cs or Server/Actions
                 |
                 v
       Server/<Feature>/Application
                 |
                 v
       Server/<Feature>/Domain

Infrastructure --------implements--------> Application ports
Composition ---------------------------------> wires adapters
```

React and DRX never call repositories, DbContext or infrastructure. A page
loader, Server Action, Minimal API or controller is a Presentation adapter: it
reads transport data, authorizes, invokes one use case and maps the result.

## Feature layout

Prefer vertical feature ownership instead of global folders containing unrelated
classes:

```text
Server/
  Billing/
    Domain/
      Invoice.cs
      Money.cs
    Application/
      IInvoiceStore.cs
      GetInvoice.cs
      CloseInvoice.cs
    Infrastructure/
      EfInvoiceStore.cs
    Actions/
      CloseInvoiceAction.cs
    Composition/
      BillingServices.cs
app/
  billing/
    [id]/
      page.server.cs
      page.drx
```

Use one public use case per file. A use case has one application reason to
change, receives narrow ports through its constructor, exposes an
`ExecuteAsync` method and accepts a `CancellationToken`. Result types make
expected outcomes explicit; exceptions represent unexpected failures.

## How SOLID applies

- Single Responsibility: entities protect invariants; use cases orchestrate one
  operation; loaders/actions translate HTTP and props; repositories persist.
- Open/Closed: add a new use case or adapter without editing a broad god service.
- Liskov Substitution: every adapter honors the cancellation, nullability,
  ordering and concurrency behavior documented by its application port.
- Interface Segregation: define small use-case-owned ports, never a catch-all
  service or generic repository merely to create an abstraction.
- Dependency Inversion: Application defines the port; Infrastructure implements
  it; Composition selects the implementation.

Do not create an interface for deterministic domain objects or every concrete
class. Abstract volatile effects: persistence, external APIs, queues, files,
identity context and time when behavior depends on them. Prefer `TimeProvider`
over a custom clock interface.

## Page loaders and Server Actions

`page.server.cs` may parse route/query data, rely on declarative authorization,
call a use case and map a presentation record. It must not contain accounting
rules or direct database queries. Server Actions additionally validate their
input, use antiforgery/authorization supplied by the framework, invoke a use
case and return an explicit transport result.

Presentation records are immutable and contain only fields the browser is
allowed to see. Generated TypeScript contracts are the boundary, not the domain
model.

## React responsibilities and CSS

Put reusable product UI in `src/features/<feature>` and neutral primitives in
`src/components`. Keep state local and lift it only when two consumers need
the same owner. Separate data-independent formatting functions from components
when they deserve direct tests.

Import feature CSS from the DRX, layout or component that owns it. Global reset,
tokens and document defaults belong in `src/styles.css`. Put public assets in
`public/`; declare local fonts in `app/fonts.ts` with `@dotreact/font` so the
framework owns `@font-face`, CSS variables and SSR preloads. In
development DotReact discovers CSS reachable from the current page and layouts
and places a blocking route stylesheet in the SSR `<head>`; production uses
the extracted Vite bundle. Do not append runtime `<style>` tags to repair
first paint.

## Tests

- Domain tests cover invariants without ASP.NET, a database or React.
- Application tests use focused port fakes and cover outcomes/cancellation.
- Infrastructure tests exercise the real adapter and persistence technology.
- Presentation tests verify authorization, mapping, contracts and status.
- SSR/E2E tests verify HTML, blocking styles, hydration and Server Actions.

A change is complete only after contract drift, typecheck, backend tests, build
and the relevant SSR/E2E flow pass.
