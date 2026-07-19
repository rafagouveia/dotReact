# ADR-002: Typed JSON instead of C# expressions in JSX

Status: accepted.

Page data crosses the runtime boundary as JSON using documented serialization
rules. TypeScript contracts will be generated from the C# public page models and
builds will fail on unsupported types or drift.

Literal C# inside JSX is rejected for the first releases. A hybrid syntax would
require a parser, language service, source maps, debugger support, formatter, and
two-runtime execution semantics. Generated props and actions provide the desired
type safety without degrading existing React tooling.

