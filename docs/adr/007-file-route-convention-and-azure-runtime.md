# ADR 007: File route convention and Azure production runtime

## Status

Accepted for the first production-hosting slice.

## Decision

ASP.NET Core remains the only public process and routing authority. A DRX file
never creates an endpoint by itself. The one-argument `[DotReactPage(moduleId)]`
attribute derives an ASP.NET route from the same canonical module ID used by the
frontend. The existing explicit pattern overload remains available for route
constraints and custom routes.

Production uses a prebuilt client bundle and prebuilt SSR entry. It never starts
Vite. ASP.NET serves browser assets, supervises a loopback-only Node renderer,
creates an in-memory renderer token, waits for readiness and stops the entire
host if the child exits unexpectedly so the platform can recover the instance.

The public health contract is `/_health/live` for the ASP.NET process and
`/_health/ready` for the renderer dependency. The container exposes only port
8080; the Node port is never bound publicly.

## Consequences

- Source files and a stable working directory are not required after publish.
- The same artifact works in Azure App Service custom containers and Azure
  Container Apps.
- Explicit routes remain fully backward compatible.
- TypeGen manifest schema v2 records whether routing is `explicit` or
  `convention`; the frontend accepts schema v1 and fails on v2 route drift.
- A container orchestrator restarts the host after an unexpected renderer exit.
- Error boundaries, status results and redirects remain a following slice.
