# DotReact guide for coding agents

This document is the core DotReact application guide. It is part of a mandatory
documentation set listed in the root `AGENTS.md`. Read every listed chapter
before planning or editing code. `PROJECT.md` describes the product; the numbered
chapters are the operational framework specification.

## 1. Mental model

DotReact combines two runtimes behind a small, typed boundary:

```text
HTTP request
  -> ASP.NET Core route and authorization
  -> C# page loader
  -> serialized generated props
  -> React server renderer
  -> HTML + hydration payload
  -> React browser hydration

Browser mutation
  -> generated TypeScript Server Action caller
  -> CSRF and authorization checks
  -> C# Server Action
  -> application use case and persistence
  -> typed result + route/cache revalidation
```

ASP.NET Core remains the public server and authority. Node is a private React
renderer, not an application backend. React never connects directly to the
database or reads backend secrets.

## 2. What DRX means

Files ending in `.drx` contain normal React TypeScript/TSX. The extension lets
the DotReact Vite plugin discover routes, layouts and boundaries, apply React
Fast Refresh and validate the frontend against the compiled C# manifest.

DRX is not a mixed C#/JSX language. These patterns are invalid:

```tsx
// Invalid: Razor/C# is never evaluated inside DRX.
<h1>@Model.Customer.Name</h1>
<p>{DateTime.UtcNow}</p>
```

The supported equivalent is a generated prop:

```csharp
public sealed record CustomerPageProps(string Name, DateTimeOffset GeneratedAt);

public sealed class CustomerPage(ICustomerQueries queries, TimeProvider timeProvider)
    : IDotReactPage<CustomerPageProps>
{
    public async ValueTask<CustomerPageProps> LoadAsync(
        DotReactPageContext context,
        CancellationToken cancellationToken)
    {
        var id = context.GetRouteValue<int>("id");
        var customer = await queries.GetAsync(id, cancellationToken);
        return new(customer.Name, timeProvider.GetUtcNow());
    }
}
```

```tsx
import { definePage } from "@rafagouveia/dotreact-client/router";
import type { CustomerPageProps } from "../../../src/contracts";

export default definePage<CustomerPageProps>(function CustomerPage(props) {
  return <h1>{props.name}</h1>;
});
```

`{props.name}` is React expression interpolation over serialized C# data. It is
typechecked, SSR-rendered and reused for hydration.

## 3. File routing and module IDs

The default route root is `app/`. React and its C# loader are co-located:

```text
app/page.drx + page.server.cs                    /                 module: page
app/about/page.drx + page.server.cs               /about            module: about/page
app/(shop)/products/[id]/page.drx + page.server.cs /products/:id    module: (shop)/products/[id]/page
app/docs/[...slug]/page.drx + page.server.cs       /docs/*slug       catch-all route
```

The app source generator derives route registration from `page.server.cs`, so
ordinary pages do not repeat a `[DotReactPage]` ID. Assembly discovery remains
the runtime registration mechanism in `Server/Program.cs`:

```csharp
builder.Services.AddDotReactPages(typeof(Program).Assembly);
builder.Services.AddDotReactActions(typeof(Program).Assembly);

app.MapDotReactPages();
app.MapDotReactActions();
```

Additional application assemblies can be passed to the discovery registration.
Use manual `MapDotReactPage` only for a deliberate compatibility integration,
not for ordinary new pages.

Parenthesized route groups organize code without changing the URL. Underscore
folders are private and ignored by routing. Only `page.drx` becomes a route;
layouts and boundaries retain their special roles.

## 4. Page loaders and outcomes

A loader implements `IDotReactPage<TProps>` and returns serializable public
presentation data. It may use application use cases but should not contain
business rules or access `DbContext` directly.

Use `DotReactPageContext` for route values and request context. Pass the supplied
`CancellationToken` through every asynchronous operation. Express not-found,
redirect and error outcomes with the framework result APIs instead of encoding
them as magic props.

Apply `[Authorize]`, roles or policies to the loader when the page is protected.
Authorization happens before props are loaded and before SSR.

## 5. Pages, layouts and boundaries

Use `definePage<TProps>` for typed page modules and export metadata when needed:

```tsx
export const metadata = {
  title: "Invoices · My app",
  description: "Invoice workspace"
};

export default definePage<InvoicesPageProps>(function InvoicesPage(props) {
  return <InvoicesTable initialRows={props.rows} />;
});
```

Special files are discovered separately:

- `layout.drx`: wraps descendant routes; use `defineLayout` and
  `DotReactLayoutProps`. It is presentation, not a backend loader.
- `loading.drx`: optional nearest loading/Suspense override.
- `error.drx`: optional nearest render/navigation error override.
- `not-found.drx`: optional nearest not-found override.
- `global-error.drx`: optional root production override for uncaught client errors.

DotReact provides all default boundary behavior in its runtime, including the
development diagnostics overlay. Do not add these files as boilerplate. Create
one only when the application needs custom UI, and keep its props compatible
with the router types. Nested layouts are
composed from root to leaf and can remain mounted during compatible client-side
navigation.

## 6. Server Actions: browser to C#

Define request/result records in C# presentation contracts, then implement an
action:

```csharp
[Authorize(Policy = "invoices.write")]
[DotReactAction("invoices/create")]
public sealed class CreateInvoiceAction(ICreateInvoice useCase)
    : IDotReactAction<CreateInvoiceRequest, InvoiceDto>
{
    public async ValueTask<DotReactActionResult<InvoiceDto>> ExecuteAsync(
        CreateInvoiceRequest request,
        CancellationToken cancellationToken)
    {
        var result = await useCase.ExecuteAsync(request, cancellationToken);
        return DotReactActionResult<InvoiceDto>.Success(result, ["/invoices"]);
    }
}
```

After `npm run generate`, call the generated function from React:

```tsx
import { invoicesCreate } from "../../actions";

const invoice = await invoicesCreate(input, {
  idempotencyKey: crypto.randomUUID()
});
```

The client handles same-origin credentials, CSRF and structured errors. The C#
action must still validate all input, authorize the operation and return safe
validation/not-found/conflict results. Use idempotency for retryable mutations.
Successful actions may return route or tag revalidation targets.

Never use a JavaScript `"use server"` action. DotReact mutations are C# Server
Actions. Do not replace them with an ad-hoc browser `fetch` unless implementing a
documented conventional ASP.NET Route Handler integration.

## 7. Generated files and contract workflow

These files are build artifacts committed for deterministic review and CI:

- `src/contracts.ts`: TypeScript representation of public C# contracts;
- `src/actions.ts`: typed Server Action callers;
- `src/backend-manifest.json`: discovered page/action modules and routes.

Change the C# source, then regenerate:

```powershell
npm run generate
```

`npm run check:contracts` does not rewrite files; it fails when committed
artifacts are stale. Never patch generated output to hide a mismatch.

## 8. SSR, hydration and client behavior

The first request must render useful HTML on the server. Browser hydration then
attaches interaction to the same tree and props. Avoid reading time, randomness,
browser-only globals or mutable external state during the initial React render,
because that causes hydration drift.

Use effects only for browser-only side effects. Use the DotReact router and link
components for partial navigation, prefetch and refresh. Do not refetch initial
loader data in `useEffect`; it is already present in props.

Fast Refresh applies to DRX/React changes. `dotnet watch` handles supported C#
edits. A loader or public contract change may also require `npm run generate`.

## 9. Security and architecture

- Policies and resource authorization belong in C#.
- Secrets and connection strings stay in server configuration or a managed
  secret store, never props, hydration data or `VITE_*` variables.
- Validate route values and action requests at the C# boundary.
- Domain must not reference ASP.NET Core, EF Core, React or DotReact.
- Application owns use cases and small ports; Infrastructure implements those
  ports; Presentation maps framework requests and results.
- Avoid generic repositories, artificial mapper interfaces and broad services
  without a real substitution boundary.
- Keep renderer module identifiers generated and allowlisted. Never build a
  dynamic import path from request input.

## 10. Common agent workflow

1. Read `AGENTS.md` and this entire document.
2. Inspect the nearest existing route, loader, action and tests before designing.
3. Keep business behavior cohesive and transport adapters thin; the concrete
   folders and backend architectural style are defined by the application.
4. Add or change the C# contract/loader/action.
5. Add the matching DRX route or feature component.
6. Run `npm run generate`.
7. Add tests for validation, authorization, outcomes and persistence where
   relevant.
8. Run `npm run typecheck`, `npm run check:contracts` and `npm run build`.
9. For runtime-sensitive changes, run `npm run dev` and verify SSR HTML,
   hydration and the action/navigation flow.

Before handoff, state which checks ran and any production concern that remains.
