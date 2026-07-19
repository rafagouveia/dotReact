# ADR-001: ASP.NET Core edge with a Node renderer sidecar

Status: accepted for protocol v1.

ASP.NET Core is the only public HTTP server. It owns routing, authentication,
authorization, cookies, backend services, and response status. A long-lived Node
process bound to loopback imports React modules and returns rendered markup over
a versioned JSON protocol.

This keeps each ecosystem on its supported runtime, preserves React/Vite tooling,
and prevents the renderer from becoming an alternative backend authority. The
cost is a second process, so health checks, timeouts, correlation IDs, shutdown,
and deploy packaging are framework responsibilities.

