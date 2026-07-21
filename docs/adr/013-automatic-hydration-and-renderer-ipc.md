# ADR-013: Automatic route hydration and local renderer IPC

## Status

Accepted for the classic DRX runtime. Component-level RSC splitting remains experimental.

## Decision

All DRX pages render on the server. The production compiler analyzes each page,
its inherited layouts and recursively imported local components. Browser hooks,
JSX events, browser globals, `"use client"`, unresolved imports and unknown
packages require hydration. Only a route proven server-only may omit bootstrap
props, module preloads and the client runtime. Development always hydrates.

The managed React renderer remains a resident Node worker pool because React SSR
requires a JavaScript runtime. Linux/macOS production hosts communicate through
an authenticated Unix-domain socket by default; Windows uses an isolated Named
Pipe. Authenticated loopback HTTP remains an explicit fallback. The public ASP.NET
process remains the only network edge and the renderer still receives no backend
secrets.

Buffered SSR uses an authenticated persistent framed channel by default for the
managed renderer. Frames carry a bounded correlation ID and the compact binary
render payload, allowing multiple requests to be in flight on each connection and
responses to complete out of order. The host keeps one connection per Node worker,
which avoids per-request HTTP parsing without creating an unbounded pool. Props
remain JSON UTF-8, while HTML travels as raw UTF-8 rather than an escaped JSON field.
HTTP remains responsible for readiness, drain, streaming SSR and compatibility.
External renderers retain the JSON v1 and binary HTTP v2 endpoints; the framed path
can be disabled with `DOTREACT_RENDERER_FRAMED_PROTOCOL=false`.

Identical buffered SSR requests are coalesced only while they are in flight. The
coordinator retains no rendered user data and bounds the number of distinct
flights. Persistent HTML caching remains the explicit SSG/ISR responsibility.

## Consequences

- Static routes have no hydration mismatch surface and transfer no page runtime.
- Interactive routes retain existing SSR, hydration, navigation and error behavior.
- Unknown code fails toward correctness by keeping hydration enabled.
- Route-level analysis is not a replacement for component-level RSC/Flight.
- Production benchmarks compare server-only and interactive categories separately.
  Cached/ISR routes are excluded until every baseline uses the same document,
  cache key and TTL.
- A broken framed channel fails all its correlated in-flight requests, reconnects on
  demand and applies the existing bounded retry policy. Tokens are authenticated once
  per connection with a constant-time comparison and are never logged.
