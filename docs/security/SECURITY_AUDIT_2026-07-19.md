# DotReact security audit — 2026-07-19

## Executive summary

The audit found two high-severity confidentiality/isolation risks, one high-severity availability risk and four medium-severity hardening gaps. All seven findings were corrected in the framework core and covered by regression tests or CI policy. No known critical or high-severity finding remains open in the audited scope.

This result is not a claim that the framework is vulnerability-free. It is a source-assisted review of the current private-preview revision, its production hosting defaults and first-party dependencies. A public release should still receive independent penetration testing and load testing.

## Scope and threat model

Reviewed surfaces:

- ASP.NET Core page/action discovery, authorization, antiforgery, caching and error responses;
- the ASP.NET ↔ Node renderer process and authenticated loopback protocol;
- DRX/Vite discovery, SSR/hydration payloads, metadata and client navigation;
- local/remote image optimization and SSRF/resource-exhaustion controls;
- CSP/security headers, static assets and third-party scripts;
- npm, NuGet, CI workflow and deployment-manifest supply chain.

The assumed attacker is an unauthenticated internet client, an authenticated tenant trying to cross authorization boundaries, or compromised/untrusted frontend or dependency code running inside the renderer. Host administrators and application source are trusted. Development mode is explicitly outside the production trust boundary.

## High severity — fixed

### DR-SEC-001 — Backend secrets inherited by the Node renderer

**Evidence:** `dotnet/src/DotReact.AspNetCore/DotReactNodeRendererHostedService.cs:294` and `DotReactNodeRendererOptions.cs:32`.

**Impact:** `ProcessStartInfo` inherited the complete ASP.NET host environment. SSR code or a compromised Node dependency could read database credentials, Redis secrets, cloud identity variables or other backend-only configuration through `process.env`, contradicting the renderer isolation boundary.

**Fix:** the child environment is cleared, a small platform allowlist is restored, framework transport variables are injected, and optional public values require explicit `PublicEnvironmentVariables`. `NODE_OPTIONS`, `DOTREACT_*`, invalid names and oversized/invalid values are rejected. A regression test places a fake database secret in the parent environment and verifies it cannot cross the process boundary.

**False-positive assessment:** confirmed by .NET process-environment semantics and Node's public `process.env`; no special attacker-controlled request was required once code executed in the renderer.

### DR-SEC-002 — Shared page cache could cross authenticated identities

**Evidence:** `dotnet/src/DotReact.AspNetCore/DotReactServiceCollectionExtensions.cs:208`.

**Impact:** the original registration rejected explicit `[Authorize]` only. A host-wide fallback authorization policy could protect a cached page without class metadata, while the shared cache key remained path/query-based. User-specific props could then be served to another authenticated user.

**Fix:** `[DotReactCache]` now requires explicit `[AllowAnonymous]` and rejects any authorization metadata. Authenticated caching must use an application-owned, identity/tenant-aware cache instead of the shared anonymous cache.

**False-positive assessment:** exploitable only with both a fallback authorization policy and identity-dependent loader output, but that is a normal ASP.NET production configuration; the boundary therefore failed safe-default expectations.

### DR-SEC-003 — Unbounded concurrent image transforms

**Evidence:** `dotnet/src/DotReact.AspNetCore/Images/DotReactImageEndpoint.cs:54`, `DotReactImageOptions.cs:44`, and `DotReactRateLimiting.cs:9`.

**Impact:** each accepted request could fetch, decode and re-encode a large raster image. Existing byte/pixel limits bounded one request, but parallel requests could exhaust CPU and memory and make the host unavailable.

**Fix:** a framework-owned semaphore bounds transforms (default 4, configurable 1–256), excess work receives `429` plus `Retry-After`, and the production rate-limiting policy is attached to the image endpoint. A concurrent regression test proves the second transform is rejected before decoding.

**False-positive assessment:** confirmed resource-amplification path; no authentication is required for public images.

## Medium severity — fixed

### DR-SEC-004 — CSP extension points accepted unsafe source expressions

**Evidence:** `dotnet/src/DotReact.AspNetCore/DotReactSecurityHeadersExtensions.cs:23-43`.

**Impact:** `AdditionalScriptSources` accepted values such as `*`, `data:` and `'unsafe-inline'`. A small configuration mistake could silently remove the intended XSS containment.

**Fix:** additive sources accept only exact credential-free HTTPS origins; connect sources additionally allow exact WSS origins. Advanced applications can still set a complete CSP override, which remains an explicit trust decision.

**False-positive assessment:** this was configuration-assisted rather than remotely toggled, but secure framework defaults must reject high-risk policy widening.

### DR-SEC-005 — Remote metadata scripts did not require integrity

**Evidence:** `packages/script/src/index.ts:8-25` and `dotnet/src/DotReact.AspNetCore/DotReactEndpointRouteBuilderExtensions.cs:1240-1284`.

**Impact:** once a CDN origin was allowed by CSP, a compromised CDN or changed third-party asset could execute with the application's origin privileges.

**Fix:** credential-free HTTPS scripts now require a valid SHA-256/384/512 Subresource Integrity token in the helper, client navigation installer and final ASP.NET HTML boundary. Remote scripts default to anonymous CORS. Local root-relative scripts remain supported without SRI.

**False-positive assessment:** a trusted third party is part of the exploit chain, so severity is medium; SRI directly removes unexpected-content execution for pinned assets.

### DR-SEC-006 — Production antiforgery cookie and transport hardening were implicit

**Evidence:** `dotnet/src/DotReact.Hosting/DotReactApplicationHostingExtensions.cs` production registration and middleware.

**Impact:** relying on generic defaults allowed the antiforgery cookie to be used without a framework-enforced `Secure` policy, and the production facade did not install HSTS itself. A TLS/proxy misconfiguration could weaken transport guarantees.

**Fix:** production hosting forces `HttpOnly`, `SameSite=Strict` and `Secure=Always` for the antiforgery cookie and enables HSTS. Development HTTP remains usable.

**False-positive assessment:** requires transport/deployment misconfiguration, but production-safe conventions are a stated framework responsibility.

### DR-SEC-007 — Mutable CI actions and incomplete dependency gate

**Evidence:** `.github/workflows/ci.yml:16-111`, `.github/dependabot.yml`, `package.json:22` and `scripts/audit-dotnet-packages.mjs`.

**Impact:** mutable action tags expand supply-chain risk, and CI audited npm but did not fail on vulnerable transitive NuGet packages.

**Fix:** first-party and third-party Actions are pinned to resolved commit SHAs; Dependabot covers npm, NuGet, GitHub Actions and Docker; the verification/CI pipeline now parses both framework and CRUD NuGet vulnerability reports and fails on findings.

**False-positive assessment:** no current dependency compromise was found. This is preventive supply-chain hardening, not evidence of a past compromise.

## Existing controls validated

- Server Actions require authorization by default and validate the ASP.NET antiforgery token (`DotReactEndpointRouteBuilderExtensions.cs:260-318`).
- Hydration JSON escapes script-closing payloads and has an XSS regression test (`DotReactEndpointTests.cs:15-88`).
- Production renderer errors do not disclose exception messages, stack traces or private paths (`DotReactEndpointTests.cs:96`).
- Redirect results reject external, scheme-relative, backslash and header-injection destinations.
- Remote images use exact HTTPS origin allowlists, disable redirects/cookies/decompression, pin a validated public DNS result and reject loopback/private/link-local destinations.
- DRX discovery remains below the canonical root and rejects symlink/junction escape and browser imports of server-only modules.
- Current npm audits (root and docs) and NuGet transitive audits reported zero known vulnerabilities.
- Static secret-pattern review found no committed production credential. Purpose-built `trivy`, `gitleaks` and `semgrep` binaries were not locally installed; CI already runs Trivy against compiled Azure templates.

## Residual operational requirements

1. Do not expose development mode or its source maps/error overlay to an untrusted network. A Cloudflare tunnel used for development needs an independent identity-aware access policy.
2. Persist and protect the ASP.NET Core Data Protection key ring for multiple replicas or ephemeral containers; every replica must share it for authentication and antiforgery continuity.
3. Treat the complete CSP override as privileged configuration and regression-test the emitted header.
4. Keep an upstream WAF/platform limiter. In-process rate/concurrency limits protect resources but cannot absorb a volumetric DDoS attack.
5. Run an independent penetration test and representative Azure load test before the first public stable release.

## Verification performed

- `npm run typecheck`
- starter and CRUD `check:contracts`
- `npm test` (all JavaScript/TypeScript workspaces, 141 .NET framework tests with one Redis integration test skipped, and 17 CRUD tests)
- `npm run build`
- root and docs `npm audit --audit-level=high`
- `npm run audit:dotnet`
- targeted malicious-input tests for CSRF, XSS payloads, unsafe redirects, image traversal/SSRF, renderer secret isolation, CSP widening, shared-cache authorization and image concurrency

## Authoritative references

- [.NET `ProcessStartInfo.EnvironmentVariables`](https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.processstartinfo.environmentvariables?view=net-10.0)
- [Node.js `process.env`](https://nodejs.org/api/process.html#processenv)
- [ASP.NET Core antiforgery guidance](https://learn.microsoft.com/en-us/aspnet/core/security/anti-request-forgery?view=aspnetcore-10.0)
- [ASP.NET Core rate limiting guidance](https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit?view=aspnetcore-10.0)
- [Subresource Integrity](https://developer.mozilla.org/en-US/docs/Web/Security/Defenses/Subresource_Integrity)
