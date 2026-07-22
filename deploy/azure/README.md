# DotReact on Azure

DotReact uses one externally visible container. ASP.NET Core listens on port
8080 and supervises the production Node SSR renderer on loopback port 5178.
The renderer token is generated in memory and is not an Azure application
secret.

Operationally this is one ASP.NET Core web app, just like a containerized Razor
or Blazor application: the same Azure resource owns ingress, TLS, identity,
health, logs and scale. DotReact additionally carries a private Node renderer,
so its minimum memory is normally higher than an equivalent Razor-only app.
It does not require a second public App Service or Container App.

Build the repository image from the repository root:

```powershell
docker build -t <registry>/dotreact:<immutable-version> .
```

Projects created with `dotreact create` contain their own Dockerfile and use the
same runtime topology.

Validate and deploy the templates with the matching example parameters:

```powershell
az bicep build --file deploy/azure/app-service.bicep
az bicep build --file deploy/azure/container-apps.bicep
az deployment group create --resource-group <group> --template-file deploy/azure/app-service.bicep --parameters @deploy/azure/app-service.parameters.example.json
az deployment group create --resource-group <group> --template-file deploy/azure/container-apps.bicep --parameters @deploy/azure/container-apps.parameters.example.json
```

The example parameter files intentionally use a private ACR image. Replace the
image digest and every identity placeholder before deployment. Template
assertions reject an ACR image without managed-identity authentication and also
reject partial identity configuration. For a public registry, set
`registryAccess` to `public` and leave the identity parameters empty.

## Private Azure Container Registry prerequisite

Create a user-assigned identity and grant it `AcrPull` on the registry before
deploying either compute resource. Role assignment propagation must complete
before the first container pull:

```powershell
$identity = az identity create --name dotreact-acr-pull --resource-group <group> | ConvertFrom-Json
$registryId = az acr show --name <registry-name> --resource-group <group> --query id --output tsv
az role assignment create --assignee-object-id $identity.principalId --assignee-principal-type ServicePrincipal --role AcrPull --scope $registryId
```

Use `$identity.id` as `acrPullIdentityResourceId` in both templates. App Service
also requires `$identity.clientId` as `acrPullIdentityClientId`. The templates
attach this identity to the workload and configure the registry pull path; no
registry password belongs in source control or deployment parameters.

## Azure App Service

Configure the custom Linux container with:

```text
WEBSITES_PORT=8080
ASPNETCORE_HTTP_PORTS=8080
WEBSITE_WARMUP_PATH=/_health/ready
WEBSITE_WARMUP_STATUSES=200
WEBSITES_CONTAINER_START_TIME_LIMIT=300
```

Set Health Check to `/_health/ready` and enable Always On. Use managed identity
with `AcrPull` for private Azure Container Registry images. Deploy an immutable
tag or digest to a staging slot, validate SSR, assets and Server Actions, then
swap. Roll back by swapping to the previous slot/image.

The App Service template creates a system-assigned workload identity and, for
private ACR, also attaches the pre-authorized user-assigned pull identity. Its
S1 default supports a staging slot, but this base template does not create a
slot or automate a swap. Manage the slot as a separate deployment resource or
pipeline stage and do not treat a base-template update as a canary rollout.

## Azure Container Apps

Configure external ingress with `targetPort: 8080`. Define HTTP probes on port
8080: Startup and Readiness use `/_health/ready`; Liveness uses
`/_health/live`. Multiple revision mode supports explicit progressive traffic
migration and rollback to a named previous image revision.

The Container Apps template defaults to exactly one replica. Raise
`maxReplicas` only after mutable data has moved to a scale-safe external
database. The template rejects `maxReplicas` lower than `minReplicas`.

## Cost model

App Service dedicated tiers bill the allocated plan instances, regardless of
request volume. Several applications can share a plan when its CPU and memory
headroom are sufficient. Container Apps Consumption meters active/idle compute
and requests and can scale to zero; use `minReplicas=1` when cold-start latency
is unacceptable. DotReact's supervised Node heap must be included when sizing
either platform. Use the repository comparison benchmark plus production memory
telemetry rather than inferring cost from framework names.

Razor usually has the smallest runtime baseline. DotReact trades extra renderer
memory for React SSR, hydration and client navigation without keeping an
application connection open after hydration. Interactive Blazor Server normally
keeps SignalR circuits and per-user server state, so its cost must be compared at
the expected concurrent-session count rather than request throughput alone.

## SQLite

SQLite is suitable for the local CRUD demonstration and a single-replica Azure
test. Mount persistent storage and keep minimum and maximum replicas at one. Do
not use SQLite for horizontally scaled production; install an Azure SQL or
PostgreSQL persistence plugin instead.

## Required production checks

- Container runs as the non-root .NET image user.
- Health endpoints, SSR and `/_dotreact/client.js` return 200.
- Logs never contain the renderer token.
- Killing Node makes readiness fail while the bounded supervisor restarts it.
- More than three crashes in five minutes stops ASP.NET for platform recovery.
- Container shutdown leaves no Node process behind.
- Image scan and SBOM have no unresolved critical/high blocker.

The supervisor emits structured logs without the shared token and publishes the
`DotReact.Hosting.Node` meter with `dotreact.renderer.unexpected_exits`,
`dotreact.renderer.restarts`, `dotreact.renderer.restart_limit_exceeded`, and
`dotreact.renderer.startup.duration`. Connect this meter to the application's
OpenTelemetry exporter when Azure Monitor/Application Insights is installed.

## Azure references

- [App Service custom container configuration](https://learn.microsoft.com/en-us/azure/app-service/configure-custom-container)
- [App Service application settings](https://learn.microsoft.com/en-us/azure/app-service/reference-app-settings)
- [Azure Container Apps health probes](https://learn.microsoft.com/en-us/azure/container-apps/health-probes)

## Rollout and rollback

Use immutable image references and keep the previous digest available.

For App Service, deploy to staging, wait for `/_health/ready`, verify an SSR
page, `/_dotreact/client.js`, and an authenticated Server Action, then swap.
Rollback by swapping the prior slot back or restoring its exact image digest.

For Container Apps, the default `latestRevisionWeight=100` is an immediate
cutover; it is deliberately not described as an automatic canary. For an
explicit canary, record the current healthy revision name and deploy the new
image with that value in `stableRevisionName` and
`latestRevisionWeight=0`. After the new revision is ready and its
revision-specific endpoint has passed the same checks, redeploy traffic-only
changes at 5, 25, and 100. The template always makes the two weights sum to 100.
Rollback by setting `latestRevisionWeight=0` and `stableRevisionName` to the
previous healthy revision. Keep that revision active until the observation
window has passed.

The template output `latestRevisionName` identifies the candidate created by a
deployment. A canary request without `stableRevisionName` fails validation
instead of silently routing all traffic to the new revision.

Database changes are outside this infrastructure slice. A future migration must
remain backward compatible with both application revisions for the complete
rollout and rollback window.
