# ADR-004: Classic SSR and hydration before React Server Components

Status: accepted.

The first public contract uses React server rendering followed by `hydrateRoot`.
Streaming and Suspense can evolve the transport after request/response behavior
is stable. React Server Components are not part of the MVP because adopting them
would expand bundler, module graph, cache, and protocol scope before the core C#
integration is proven.
