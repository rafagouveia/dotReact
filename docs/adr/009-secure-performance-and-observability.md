# ADR 009 — Secure performance and observability defaults

## Status

Accepted.

## Context

DotReact must improve rendering throughput and production visibility without
caching personalized SSR HTML, leaking antiforgery tokens or creating
high-cardinality telemetry.

## Decision

- SSR HTML and Server Action responses use `private,no-store`.
- Fingerprinted static assets use a one-year immutable policy; stable filenames
  must revalidate. Compression remains the host/proxy responsibility.
- Shared HTML caching and dynamic HTML compression are not framework defaults
  while props and antiforgery tokens share the representation.
- The production renderer uses bounded concurrency/body/response limits,
  configurable keep-alive/request timeouts and explicit response lengths.
- `DotReactTelemetry` publishes stable `ActivitySource`/`Meter` names. Action IDs
  are bounded by discovery; props, tokens, request IDs and URLs are not labels.
- The starter connects these sources to OpenTelemetry and activates OTLP export
  only when `OTEL_EXPORTER_OTLP_ENDPOINT` is configured.
- Production security headers include a strict CSP without `unsafe-inline`;
  development permits only the configured Vite HTTP/WebSocket origin.
- Action rate limiting is opt-in at service registration and local to an instance.
- Performance claims require `dotreact analyze` and a reproducible
  `dotreact benchmark` baseline with failure count and p50/p95/p99.

## Consequences

Safe defaults may require explicit CSP changes for CDNs or OAuth popups. Global
rate limits and idempotency across replicas need a gateway or distributed store.
Streaming and shared SSR caches remain separate future protocol decisions.
