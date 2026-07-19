# DotReact engineering rules

These rules apply to every change in this repository.

## SOLID is a release requirement

- Give each module, class and function one cohesive reason to change.
- Keep composition roots and HTTP endpoints thin. They translate inputs, invoke
  a use case and translate its result; business rules do not live there.
- Keep Domain free from ASP.NET Core, EF Core, React, Vite and serialization.
- Keep Application dependent only on Domain and small application-owned ports.
- Infrastructure implements application ports. Framework and database details
  must not leak into Domain or Application.
- Presentation depends on use-case interfaces, never directly on DbContext.
- Prefer one use-case type per operation over broad `*Service` classes.
- Prefer small capability interfaces. Do not add generic repositories, generic
  mappers, service locators or mediator abstractions without a concrete need.
- Inject time, persistence and external effects. Do not call static clocks or
  construct infrastructure dependencies inside business logic.
- Preserve substitutability: implementations must honor interface semantics,
  cancellation, nullability and documented error states.
- Add behavior by introducing implementations/composition when possible instead
  of adding conditionals to stable core modules.

## Change gates

Every behavioral change must keep these gates green:

```powershell
npm run typecheck
npm test
npm run build
npm audit --audit-level=high
```

For C# ↔ TypeScript boundaries, also run the relevant `check:contracts` script.
For data changes, test validation, not-found behavior, persistence and isolation
from the development database.

Architecture is not considered SOLID merely because interfaces exist. Each
abstraction must own a real volatility boundary or enable a real substitution in
tests or production composition.

## DRX compiler rules

- `.drx` is trusted project source containing ordinary TSX; never embed, parse or
  evaluate C# inside it.
- Route values, action IDs and request data must never become filesystem paths,
  compiler arguments or dynamic import specifiers.
- Discover pages/layouts only below the configured canonical pages root and do
  not follow symlinks or junctions outside it.
- `layout.drx` composes presentation only. Backend data and authorization remain
  in C# page loaders/actions.
- Keep `virtual:dotreact/pages` stable across server and client rendering so SSR
  and hydration use the same component tree.
- A release build must semantically typecheck `.drx` files and validate their
  module IDs against the manifest generated from the compiled C# application.
