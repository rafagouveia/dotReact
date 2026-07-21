# DotReact security policy

DotReact is currently a private preview. Security fixes target the latest commit on `main`; no older preview revision receives a backport guarantee until the first supported public release.

## Reporting a vulnerability

Do not open a public issue containing exploit details, credentials, customer data or a working proof of concept. Use the repository's private **Security → Report a vulnerability** flow and include:

- affected commit and package;
- impact and required attacker capabilities;
- minimal reproduction without real secrets or personal data;
- suggested mitigation, when known.

The maintainers should acknowledge a complete report within three business days, assess severity within seven business days and coordinate disclosure after a fix or mitigation exists. Rotate any credential accidentally included in a report immediately.

## Security boundaries

- ASP.NET Core owns identity, authorization, persistence and secrets.
- DRX is trusted application TSX, but it never receives backend services or evaluates C#.
- The managed Node renderer is loopback-only and receives only explicit public environment values plus a short-lived framework token.
- Server Actions require authorization by default and validate antiforgery tokens for browser requests.
- Remote images and scripts are deny-by-default and require explicit allowlisting/integrity controls.

Development mode, source maps and the error overlay are not production security boundaries. Never expose a development host to an untrusted network without a separate access-control layer.

## Production deployment requirements

- Terminate TLS at a trusted ingress, forward the original scheme only from known proxies and verify that HSTS is present on HTTPS responses.
- In multi-instance or ephemeral deployments, persist and protect the ASP.NET Core Data Protection key ring. Antiforgery and authentication cookies must use the same protected key ring on every replica.
- Keep rate limiting at the application boundary and add platform/WAF limits for volumetric attacks; an in-process limiter is not DDoS mitigation.
- Run only compiled production assets. Development tunnels expose source maps and diagnostics by design.

## Release security gates

Every release candidate must pass the same deterministic checks used by the
starter:

```powershell
npm run typecheck
npm test
npm run build
npm audit --audit-level=high
npm audit --prefix docs --audit-level=high
npm run audit:dotnet
# inside each generated application
npm exec -- dotreact security --static-only
```

The source scan detects raw browser HTML sinks, string-to-code execution,
authentication material in Web Storage, wildcard `postMessage`, client secret
references, disabled outbound TLS validation and interpolated raw SQL. It is a
fast gate, not a substitute for threat modeling, authorization tests, container
image/SBOM scanning or an external penetration test before a public stable
release.
