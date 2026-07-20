# Prerendering, cache, production runtime and observability

## Rendering modes

- Dynamic SSR: the C# loader and React renderer run for each request.
- Streaming SSR: dynamic SSR delivered progressively through Suspense.
- Prerender/SSG: configured paths are generated into reusable HTML artifacts.
- ISR: a prerendered artifact remains fresh for a configured interval and is
  regenerated after expiry.
- Stale-while-revalidate: an allowed stale artifact is served while one
  coordinated refresh runs.

Do not label a browser-only fetch as SSR or ISR. Rendering mode is determined by
the server page configuration and artifact store.

## Page prerender policy

```csharp
[DotReactPage("products/[id]/page")]
[DotReactPrerender(
    revalidateSeconds: 300,
    StaleWhileRevalidateSeconds = 60,
    Tags = ["products"])]
public sealed class ProductPage : IDotReactResultPage<ProductPageProps> { /* ... */ }
```

For dynamic routes, implement `IDotReactStaticPathProvider<TPage>` and yield
bounded `DotReactStaticPath` values. Providers must be deterministic, cancellable
and safe to run during build/deploy. Do not enumerate an unbounded database.

`RevalidateSeconds = 0` means no timed revalidation metadata. The immutable
`PrerenderBuildId` isolates artifacts between deployments so a new frontend
bundle cannot hydrate old HTML.

## Store selection

The in-memory store is suitable for development or one process. Multiple
replicas require a distributed implementation so artifacts, tag invalidation,
idempotency and regeneration coordination are consistent. Configure Redis using
server-side configuration; never expose its connection string to React.

Cache keys must be based on normalized, bounded server inputs. Include tenant or
authorization scope when output varies by actor. Never cache personalized HTML
under a public/shared key.

## Invalidation

Prefer explicit invalidation from successful use cases/actions. Route paths and
tags should describe the data dependency, not UI implementation details. Test
that a mutation invalidates the correct artifact and that failed mutations do
not invalidate anything.

## Production renderer

Production uses built `dist/client` and `dist/server` artifacts. ASP.NET starts
or contacts a private renderer with a strong shared token and loopback/private
binding. `Development` must be false. React Refresh is never served in
production. Request timeout, response limits and renderer concurrency remain
bounded.

The renderer is replaceable infrastructure. It must not access the application
database or domain container. A renderer crash should fail health/readiness and
be recovered by the supervised process/platform, not silently fall back to
client-only rendering.

## Security headers and secrets

Use `AddDotReactSecurityHeaders` and `UseDotReactSecurityHeaders`. Per-request
CSP nonces authorize framework scripts without enabling arbitrary inline code.
Allow only required origins for scripts, styles, images and connections. Do not
add `unsafe-inline` as a development shortcut that leaks into production.

Secrets live in environment/platform configuration or a managed secret store.
`.env.example` contains names and safe placeholders only. Anything in props,
HTML, hydration JSON, client bundles or `VITE_*` is public.

## Azure and container readiness

The generated project includes Docker and Azure infrastructure assets. Keep
health endpoints unauthenticated only as required by the platform and ensure
they reveal no sensitive diagnostics. Use immutable deployment/revision IDs as
the build ID. Store mutable application data outside the container filesystem.

Before production, validate HTTPS/forwarded-header configuration for the actual
trusted proxy chain, identity provider, database migrations, backup/restore,
key persistence, Redis availability and scaling behavior.

## Observability

DotReact emits ASP.NET, renderer, action and browser Web Vitals telemetry through OpenTelemetry.
Configure `OTEL_EXPORTER_OTLP_ENDPOINT` on the server to export traces/metrics.
CLS, INP, LCP and TTFB are collected by the framework runtime, posted to a
bounded same-origin endpoint and correlated with the SSR request through W3C
trace context. Application code must not implement a parallel collector.

Do not use user IDs, URLs with sensitive query strings, action bodies, props,
tokens or high-cardinality request IDs as metric labels. Logs must redact secrets
and public error responses must use safe problem details.

Useful production signals include browser CLS/INP/LCP/TTFB, renderer latency/failure/concurrency, streaming
time-to-shell and completion, action outcomes, cache resolution, regeneration
duration, process restarts and readiness.

`MaxSerializedPropsBytes` bounds the JSON crossing from C# to React (512 KiB by
default). The meter records payload size without recording payload content.
Development responses expose loader/renderer `Server-Timing` values and the
serialized props byte count. Run `dotreact analyze` with separate limits for the
initial client entry, largest async route chunk, total CSS, total client and SSR.

Use `@dotreact/script` for external application/third-party scripts. Inline code
is unsupported; choose `beforeInteractive` only for truly critical consent or
bootstrap code, and prefer `lazyOnload` for analytics. Root-relative and
credential-free HTTPS sources are validated and deduplicated by the framework.
