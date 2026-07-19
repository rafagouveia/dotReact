# DotReact for VS Code

This extension associates `.drx` files with VS Code's built-in TypeScript React
language service. DotReact pages intentionally contain ordinary TSX, so syntax
highlighting, completion, navigation, formatting and React tooling work without
a second parser.

Until the extension is published, add this workspace setting:

```json
{
  "files.associations": {
    "*.drx": "typescriptreact"
  }
}
```

The included CodeLens opens the conventional `page.drx.cs` loader from a
`page.drx` view. A future language-server milestone may add symbol-level rename
and refactoring across generated C#/TypeScript contracts. The format does not
embed C# inside TSX.

Editor association provides the interactive TSX experience. The framework's
`dotreact-check` command is the build-time authority: it checks `.drx` page and
layout semantics and validates generated C# page contracts.

The extension also contributes **DotReact: Verificar projeto**, check-on-save
diagnostics and a CodeLens that opens the C# loader associated with a page.

The extension's portable path mapping and checker-diagnostic parser are covered
by the monorepo test gate. Run `npm test -w dotreact-vscode` locally.

Create an installable package without publishing it:

```powershell
npm run package:vsix -w dotreact-vscode
code --install-extension editors/vscode-dotreact/dotreact-vscode.vsix
```

`npm run test:integration -w dotreact-vscode` launches a real VS Code extension
host, opens a `.drx` document and verifies activation, language association and
the registered DotReact commands.
