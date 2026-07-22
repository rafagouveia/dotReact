# DotReact for Visual Studio Code

The official editor companion for DotReact applications: React and ordinary
TSX ergonomics in `.drx` files, with ASP.NET Core remaining the backend and
security authority.

## Features

- Syntax highlighting, completion, formatting, navigation and React tooling
  through VS Code's built-in TypeScript React language service.
- Semantic project diagnostics from the same `dotreact-check` authority used by
  CI and production builds.
- Check-on-save validation with debouncing and one coalesced checker per
  workspace, avoiding duplicate processes during save bursts.
- CodeLens navigation from `page.drx` to a colocated `page.server.cs` loader,
  with a compatibility fallback for explicitly registered loaders.
- A lightweight project-health item in the status bar and a dedicated DotReact
  output channel for debugging validation failures.
- Support for current `app/` routes and legacy `src/pages/` projects.

DotReact never parses or evaluates C# inside a `.drx` file. The bridge between
the two runtimes is made of generated TypeScript contracts and explicitly
registered C# page loaders and Server Actions.

## Commands

Open the Command Palette (`Ctrl+Shift+P`) and run:

- `DotReact: Check Project`
- `DotReact: Open C# Loader`
- `DotReact: Show Validation Output`
- `DotReact: Open Documentation`

## Settings

```json
{
  "dotreact.checkOnSave": true,
  "dotreact.validation.debounceMs": 350
}
```

The checker executes the framework tool installed by the project. VS Code keeps
that operation disabled in Restricted Mode; trust the workspace only when you
trust its source and dependencies. Virtual workspaces can still display `.drx`
as TypeScript React, but cannot execute the local project checker.

## Install a local VSIX

Until the Marketplace release is available:

```powershell
npm ci
npm run package:vsix -w dotreact-vscode
code --install-extension editors/vscode-dotreact/dotreact-vscode.vsix
```

The package workflow also uploads a tested VSIX artifact for every
`vscode-v*` tag and manual run.

## Development

```powershell
npm run build -w dotreact-vscode
npm test -w dotreact-vscode
npm run test:integration -w dotreact-vscode
```

The integration suite launches a real VS Code Extension Host, opens a `.drx`
document and verifies language association, activation and registered commands.

See [RELEASE.md](RELEASE.md) for the controlled Marketplace release process.
