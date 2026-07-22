# Data contracts, interpolation, Server Actions and security

## The only supported C# to React data path

The loader returns a public C# presentation contract. TypeGen reads the compiled
assembly and generates the matching TypeScript type. ASP.NET serializes a value
for the renderer and bootstrap payload. React reads that value as props.

```text
C# record -> generated TypeScript interface -> JSON props -> DRX expression
```

This is DotReact interpolation. There is no shared heap and no live C# object in
the browser. Changing a React prop does not mutate C# state. Persistence requires
a Server Action or an explicit ASP.NET endpoint.

## Contract design

Use small immutable records/DTOs shaped for presentation. Prefer explicit nested
DTOs over exposing EF entities. Model nullability honestly. Enums become
TypeScript unions when supported; dates arrive as serialized strings and should
be parsed only where needed.

Contracts must be JSON-safe: no delegates, streams, service instances, lazy
proxies, cycles or polymorphism without an explicit supported representation.
Do not serialize authorization decisions, secrets, connection strings, tokens or
internal exception objects.

JavaScript `number` cannot precisely represent every 64-bit integer. For large
identifiers, monetary minor units beyond the safe range or exact decimal data,
choose a string representation or a reviewed domain-specific encoding. For
accounting values, never use binary floating point for authoritative arithmetic;
calculate in C# using `decimal` or a money value object and serialize an explicit
display/transport representation.

Generated JSON property names follow the configured serialization policy. Use
the generated TypeScript contract rather than guessing casing.

## Generation workflow

Never edit generated files. After changing loader/action-visible C# types:

```powershell
npm run generate
npm run typecheck
npm run check:contracts
```

Generation compiles C# first. `check:contracts` fails on drift without rewriting.
A contract change is incomplete until its generated diff and React consumers are
reviewed.

## Server Action request path

1. TypeGen creates a function in `src/actions.ts` with request/response types.
2. React invokes it with JSON-safe input.
3. The client posts to the encoded `/_dotreact/actions/{id}` path with
   same-origin credentials.
4. The client includes the DotReact CSRF token.
5. ASP.NET authenticates, authorizes, limits the body and deserializes input.
6. The C# action invokes a use case and returns a structured result.
7. The client returns typed data or throws `DotReactActionError` with safe
   problem details.

Actions return `Success`, `Validation`, `NotFound` or `Conflict`. Map expected
business outcomes explicitly. Do not throw for normal validation or missing
resources. Unexpected failures go through centralized error handling and must
not leak details in production.

## Authorization

Treat a Server Action as a public HTTP endpoint. Prefer explicit policies:

```csharp
[Authorize(Policy = "invoices.write")]
[DotReactAction("invoices/create")]
public sealed class CreateInvoiceAction : IDotReactAction<CreateInvoiceRequest, InvoiceDto>
```

When authorization depends on the requested resource, implement the supported
resource provider and use declarative resource authorization. Never trust tenant,
owner, role, price, balance or permission fields sent by the browser. Resolve the
authenticated actor and authoritative resource in C#.

`[AllowAnonymous]` is a security decision, not a demo shortcut. Document why the
operation is public, apply rate limits and test abuse cases.

## CSRF, idempotency and replay

Cookie-authenticated mutations require the DotReact CSRF flow. Do not disable it
or replace same-origin credentials with ad-hoc token handling.

SSR and client navigation do not eagerly create an antiforgery cookie. On the
first mutation, the generated client requests `/_dotreact/csrf`, keeps the token
in memory and sends it in `X-DotReact-CSRF`. Read-only pages therefore avoid
cookie encryption and response overhead without weakening same-origin
protection. A progressive form without JavaScript must render an explicit
request-verification token using ASP.NET Core antiforgery/tag-helper facilities.

For a retryable create/payment/import operation, mark/configure idempotency as
required and send a unique `idempotencyKey`. The same key with the same request
may replay the stored response; the same key with different input must conflict.
In multi-replica production, configure the distributed store rather than relying
on process memory.

## Revalidation

A successful action can return affected route paths. ASP.NET invalidates
configured cache/prerender stores and returns `X-DotReact-Revalidate`; the client
router refreshes or invalidates matching UI. Return the smallest authoritative
set of paths. Never accept arbitrary revalidation paths from browser input.

## Client error handling

Handle `DotReactActionError` by status and structured problem fields. Show field
validation near inputs, 404 as stale-resource UI, 409 as a concurrency/conflict
flow and unexpected connectivity failures as retryable UI. Do not parse exception
strings or duplicate C# validation rules as the authority.
