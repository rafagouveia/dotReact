# Project profile for coding agents

Keep this file updated as the product evolves. It prevents an agent from knowing
the framework while misunderstanding the application.

## Identity

- Product name: replace with the real product name.
- Purpose: describe the user problem in one paragraph.
- Primary users: list the roles that use the application.
- Backend authority: ASP.NET Core.
- UI runtime: React rendered through DotReact.
- Deployment target: document the chosen Azure or other hosting model.

## Domain boundaries

List the real business modules here before implementing them. For each module,
record its owner, invariants, persistence and external integrations. Do not let
technical folders become accidental domain boundaries.

## Architecture decisions

- Domain rules belong in C# Domain/Application code.
- React is a presentation and interaction adapter.
- Data reaches pages through typed C# loaders and generated props.
- Mutations use authorized, generated C# Server Actions.
- Conventional Minimal APIs are added only for explicit external/API consumers.
- Production identity, database, queues, storage and secrets must be recorded
  here when selected.

## Current status

The generated project is a framework starter. Demo product routes and actions
are learning examples, not product requirements. Replace them deliberately and
keep this profile synchronized with the implemented modules.

## Agent change record

When a change introduces a new domain boundary, public integration, security
policy, persistence technology or deployment dependency, update this file in the
same change.

