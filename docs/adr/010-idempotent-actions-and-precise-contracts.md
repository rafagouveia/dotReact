# ADR 010 — Idempotent actions and precise contracts

## Status

Accepted.

## Decision

- `[DotReactIdempotent]` is explicit and requires a bounded printable
  `Idempotency-Key` for JSON requests.
- The store is an application-replaceable port. The default implementation is
  bounded, process-local, coalesces concurrent calls and replays exact bytes.
- Reusing a key with another payload is a conflict. Failed/cancelled executions
  are not retained. Progressive forms do not claim replay semantics.
- Successful actions may advertise bounded local revalidation paths; the client
  exposes callbacks but does not assume a particular router/cache.
- Action bodies and stored responses have independent configurable limits.
- Closed generic DTOs receive deterministic TypeScript names. `long`, `ulong`
  and `decimal` may become precision-safe strings only when the C# JSON contract
  explicitly uses `JsonNumberHandling.WriteAsString`; unsafe integers otherwise
  fail generation.
- Polymorphic unions are deferred until runtime discriminator semantics can be
  guaranteed end to end.

## Consequences

Callers own idempotency-key lifecycle. Multi-replica deployments must replace
the default store with an atomic distributed implementation. Numeric string
contracts are explicit and backward compatible rather than silently changing
existing `decimal` contracts.
