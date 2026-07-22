# DRX, routing, layouts and route outcomes

## DRX grammar

DRX is TSX with React semantics. Imports, components, hooks, JSX expressions and
TypeScript types work normally. There are no C# blocks, Razor directives or
server-only JavaScript directives. The Vite plugin transforms DRX as TSX and
builds a static virtual route registry used by both SSR and hydration.

Allowed:

```tsx
export default definePage<ReportProps>(function ReportPage({ report }) {
  return <ReportView report={report} />;
});
```

Forbidden:

```tsx
@inject ReportService Reports
<h1>@Reports.GetTitle()</h1>
```

Do not parse a custom interpolation syntax into DRX. C# values enter through
props; browser mutations leave through generated actions.

## Canonical route mapping

Every routed view ends with `page.drx`. The canonical module ID includes
`/page`, except the root which is `page`.

```text
Files                                              URL                Module ID
app/page.drx + page.server.cs                      /                  page
app/settings/page.drx + page.server.cs             /settings          settings/page
app/(crm)/customers/[id]/page.drx + page.server.cs /customers/{id}    (crm)/customers/[id]/page
app/docs/[...slug]/page.drx + page.server.cs        /docs/{**slug}      docs/[...slug]/page
```

The matching loader is co-located and needs no route attribute:

```csharp
public sealed class CustomerPage : IDotReactPage<CustomerPageProps> { /* ... */ }
```

Use the attribute only as an explicit escape hatch for ASP.NET constraints:

```csharp
[DotReactPage("/customers/{id:int}", "customers/[id]/page")]
```

Never derive a module ID from untrusted request text. Discovery and the generated
manifest are the allowlist.

Route groups such as `(crm)` remain in the module ID but are omitted from the
URL. Directories beginning with `_` are private and never produce routes. Only
`page.drx` is routable under `app/`; helper DRX files belong in a private folder
or under the nearest `_components` private folder.

## Route and query values

`DotReactPageContext` exposes the underlying `HttpContext` and invariant-culture
conversion helpers:

```csharp
var id = context.GetRouteValue<int>("id");
var search = context.GetQueryValue<string?>("q");
var tags = context.GetQueryValues<string>("tag", maxValues: 20);
```

A missing required scalar or duplicate scalar is rejected. Invalid conversion
becomes a bad request. Repeated query keys are bounded. Do not manually parse
unbounded collections.

## Page results

Use `IDotReactPage<TProps>` for an unconditional page. Use
`IDotReactResultPage<TProps>` when the loader can return a page, local redirect
or not-found result. Do not encode these outcomes as `{ found: false }` props.
Exceptions are handled by the nearest `error.drx`; expected validation or
not-found states should use explicit results.

## Layouts

`layout.drx` wraps every descendant page. Nested layouts compose root-to-leaf.
Use the framework type so optional children/page props remain correct:

```tsx
import { defineLayout, type DotReactLayoutProps } from "@rafagouveia/dotreact-client/router";

export default defineLayout(function BillingLayout({ children }: DotReactLayoutProps) {
  return <section className="billing-shell">{children}</section>;
});
```

Layouts are presentation composition. They may read current page props for
display but must not become hidden backend loaders. Parent layouts may remain
mounted during compatible partial navigation, so remount-sensitive behavior
must be deliberate.

## Boundaries

- No boundary file is required: DotReact supplies safe loading, not-found and
  error fallbacks from its core runtime.
- `loading.drx`: optional nearest pending/loading override.
- `not-found.drx`: optional nearest missing-resource override.
- `error.drx`: optional nearest rendering/navigation failure override.
- `app/global-error.drx`: optional production root override for uncaught client
  errors. It never replaces the framework diagnostics overlay in development.

Boundary modules are not pages and do not get separate C# loaders. When present,
they are selected by route ancestry and overwrite only the corresponding core
fallback. Keep their framework props optional and avoid
showing internal exception details in production.

## Metadata

A page may export a metadata object or typed resolver. Supported metadata is
turned into versioned head elements by the server entry. Keep it deterministic
from public props. Do not inject raw HTML or secrets into metadata.
