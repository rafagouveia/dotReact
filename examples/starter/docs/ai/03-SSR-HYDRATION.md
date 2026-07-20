# SSR, streaming, hydration and client navigation

## Classic SSR request

1. ASP.NET routing selects a discovered page endpoint.
2. Authentication and authorization run.
3. The C# loader produces serializable props or an explicit page outcome.
4. ASP.NET sends a versioned render request to the private renderer.
5. The framework-owned virtual server entry resolves the allowlisted page module and layouts.
6. React renders HTML with the same `DotReactApp` tree used in the browser.
7. ASP.NET writes the document, metadata, CSP nonce, CSRF metadata and a JSON
   bootstrap payload in `#__DOTREACT_DATA__`.
8. The framework-owned virtual client entry reads that payload, installs the root boundary and calls `hydrateRoot`; projects do not carry this wiring.

Do not manually render a second tree in the client entry. SSR and hydration must
receive the same pages, route modules, layouts, boundaries, module ID and props.

## Hydration contract

The bootstrap payload includes protocol version, request ID, module ID, URL,
props, optional CSRF token and optional boundary kind. It is data, not executable
JavaScript. ASP.NET serializes and HTML-escapes it.

Hydration requires deterministic first render. During initial render, do not:

- call `Date.now()`, `new Date()`, `Math.random()` or `crypto.randomUUID()`;
- branch on `window`, viewport, locale or storage;
- read a mutable singleton or make a network request;
- generate different element order, IDs or whitespace on server and browser.

Load time/random values in C# and pass them as props, or defer browser-only work
to an effect. For intentionally browser-only UI, use `DotReactClientOnly` with a
stable fallback or gate it with `useDotReactHydrated`.

React `useId()` is supported when the component tree is identical. Never use
array indexes as keys for mutable server data.

## Streaming SSR and Suspense

When `EnableStreaming` is true and protocol v2 is negotiated, the renderer uses
`renderToPipeableStream`. It emits correlated frames:

```text
start(head) -> html(sequence 0..n) -> complete(metrics)
                                  -> error(after-shell)
error(before-shell)
```

`onShellReady` begins delivery as soon as the shell and Suspense fallbacks are
ready. Deferred boundaries stream later. `onShellError` is a before-shell
failure; `onError` records render failures that can occur after a shell exists.
The request cancellation signal aborts React and destroys the stream.

Use `<Suspense fallback={...}>` around work that actually suspends. A loading
boundary provides route-level pending UI; it is not a replacement for every
component-level Suspense boundary. Fallback HTML must be deterministic and
accessible.

Never write to the response after a terminal stream frame. Do not swallow an
abort and continue expensive backend work. Pass cancellation tokens from ASP.NET
through loaders, use cases, repositories and external calls.

## Client-side navigation

`DotReactLink` intercepts eligible same-origin links and can prefetch on hover or
focus. `useDotReactRouter()` exposes:

- `navigate(href, options)`;
- `prefetch(href)`;
- `refresh()`;
- `invalidate(paths)`;
- current `url` and `pending` state.

Navigation requests use a private DotReact media type. The server returns route
module, props, boundaries and status as JSON; the router updates the React tree
without replacing the document. A non-DotReact response or incompatible payload
falls back to full document navigation.

Use `router.refresh()` after external state changes that were not represented by
an action revalidation header. Do not add a parallel client data router.

## Fast Refresh versus backend hot reload

Development browser traffic is same-origin. ASP.NET Core proxies Vite modules,
CSS and the Fast Refresh WebSocket below `/_dotreact/dev/`; the private renderer
port must never be emitted into HTML. This keeps custom domains, HTTPS tunnels
and reverse proxies working without per-domain asset configuration.

Before emitting the SSR body, ASP.NET adds the global stylesheet and a
route-aware blocking stylesheet to `<head>`. The Vite plugin follows static CSS
imports from the selected page, inherited layouts and their components. This
prevents a flash of unstyled SSR content while keeping feature CSS co-located.
Production generates an internal route-asset manifest. The host emits only the
fingerprinted global/route CSS and module preloads required by the initial route;
route JavaScript and CSS for later pages stay lazy. Do not hard-code build asset
names or add stylesheet tags to loaders/views. A missing production manifest is
a failed deployment, not a page allowed to paint without CSS.

- Editing DRX/TSX/CSS: Vite and React Fast Refresh preserve compatible component
  state.
- Editing C#: .NET Hot Reload applies supported deltas. Generated metadata
  increments a same-origin revision and the DotReact router refreshes current
  server props without replacing the document. Unsupported edits restart the
  process and trigger a full reload. The scaffold suppresses
  the separate `dotnet watch` browser-refresh script because it advertises
  machine-local WebSocket ports that cannot work through a public domain.
- Editing a public loader/action contract: `dotreact sync --watch` regenerates
  TypeScript automatically during `npm run dev`. Run `npm run generate` manually
  only outside that development session; TypeScript must never stay stale.
- Editing entry files or Vite/framework configuration may require a renderer
  restart and should not be expected to preserve state.

## Diagnosing hydration errors

First compare the server HTML and `__DOTREACT_DATA__` with the client route and
generated manifest. Then check nondeterministic rendering, conditional hooks,
browser-only branches and stale generated contracts. Do not suppress React
hydration warnings without proving that the difference is intentional and
isolated.
