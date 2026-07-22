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

`AddDotReactApplication()` always configures page-props caching. The in-memory
implementation is suitable for development or one process and needs no external
service. When `DOTREACT_REDIS_CONNECTION` exists, the hosting facade switches
page cache, sessions, tag invalidation, idempotency and regeneration coordination
to Redis and reuses one connection multiplexer per process. Never expose its
connection string to React.

Cache keys must be based on normalized, bounded server inputs. Include tenant or
authorization scope when output varies by actor. Never cache personalized HTML
under a public/shared key.

`[DotReactCache]` is the framework's shared anonymous props cache and therefore
requires an explicit `[AllowAnonymous]`. It must not be used for authenticated,
tenant-specific or user-specific loaders, including pages protected only by a
global fallback policy.

Use bounded dependency tags when several public routes depend on the same data:

```csharp
[AllowAnonymous]
[DotReactCache(300, Tags = ["catalog"])]
public sealed class CatalogPage : IDotReactPage<CatalogProps> { /* ... */ }
```

## Invalidation

Prefer explicit invalidation from successful use cases/actions. Route paths and
tags should describe the data dependency, not UI implementation details. Test
that a mutation invalidates the correct artifact and that failed mutations do
not invalidate anything.

```csharp
return DotReactActionResult<ProductDto>.Success(
    product,
    revalidatePaths: ["/products", $"/products/{product.Id}"],
    revalidateTags: ["catalog"]);
```

Page-cache invalidation rotates bounded version tokens instead of enumerating
Redis keys. Old values become unreachable immediately and expire through their
normal TTL. ISR artifacts use build-scoped keys; finite artifacts expire after
their stale recovery window and static artifacts have a configurable maximum
retention so abandoned deployment builds cannot accumulate forever.

## Production renderer

Production uses built `dist/client` and `dist/server` artifacts. ASP.NET starts
or contacts a private renderer with a strong shared token and loopback/private
binding. `Development` must be false. React Refresh is never served in
production. Request timeout, response limits and renderer concurrency remain
bounded.

The managed renderer does not inherit the ASP.NET process environment. Add only
non-secret values through `DotReactNodeRendererOptions.PublicEnvironmentVariables`.
Database, Redis, identity and cloud credentials stay in server configuration.

The renderer is replaceable infrastructure. It must not access the application
database or domain container. A renderer crash should fail health/readiness and
be recovered by the supervised process/platform, not silently fall back to
client-only rendering.

## Security headers and secrets

Use `AddDotReactSecurityHeaders` and `UseDotReactSecurityHeaders`. Per-request
CSP nonces authorize framework scripts without enabling arbitrary inline code.
Allow only required exact HTTPS/WSS origins for scripts, styles, images and connections. Do not
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

## Background jobs

Keep background adapters in `Server/Jobs` and their business operation in a
focused Application use case. A lightweight, best-effort loop may use an ASP.NET
Core `BackgroundService`. Do not hide durable cron or long-running processing in
the web process: every web replica would execute it. Use a dedicated worker,
Azure Container Apps Jobs, Azure Functions or an application-selected scheduler
and reuse the same Application and Infrastructure registrations.

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

The stable meters `dotreact.cache.operations` and
`dotreact.prerender.resolutions` expose low-cardinality cache type/operation and
fresh/generated/stale outcomes. They never include paths, tags, tenant IDs or
payload content.

`MaxSerializedPropsBytes` bounds the JSON crossing from C# to React (512 KiB by
default). The meter records payload size without recording payload content.
Development responses expose loader/renderer `Server-Timing` values and the
serialized props byte count. Run `dotreact analyze` with separate limits for the
initial client entry, largest async route chunk, total CSS, total client and SSR.

Every generated project also carries versioned Lighthouse CI assertions in
`lighthouserc.cjs`. Run them against a production build or deployed preview,
never against `npm run dev`: Vite development modules, source maps and HMR are
diagnostic overhead and do not represent the shipped application.

```powershell
$env:LHCI_URL = "https://preview.example.com/critical-route"
npm run audit:lighthouse
```

The default gate requires performance >= 90, accessibility and best practices
>= 95, FCP <= 2 s, LCP <= 2.5 s, TBT <= 200 ms and CLS <= 0.1. Application code
can still regress those values: declare intrinsic image dimensions, preload only
critical local fonts, keep initial props bounded, lazy-load noncritical routes
and scripts, preserve semantic labels, and test the heaviest authenticated and
anonymous routes separately.

Use `@rafagouveia/dotreact-script` for external application/third-party scripts. Inline code
is unsupported; choose `beforeInteractive` only for truly critical consent or
bootstrap code, and prefer `lazyOnload` for analytics. Root-relative and
credential-free HTTPS sources are validated and deduplicated by the framework.
Every remote script requires a SHA-256/384/512 Subresource Integrity value.
