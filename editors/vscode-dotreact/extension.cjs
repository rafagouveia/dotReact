const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");
const { moduleIdForPath, parseDiagnostics } = require("./core.cjs");

function workspaceFor(document) {
  return vscode.workspace.getWorkspaceFolder(document.uri);
}

function moduleIdFor(document, root) {
  return moduleIdForPath(root, document.uri.fsPath);
}

async function openBackendLoader(document) {
  const workspace = workspaceFor(document);
  if (!workspace) return;
  const moduleId = moduleIdFor(document, workspace.uri.fsPath);
  if (!moduleId || moduleId.endsWith("layout") || moduleId.endsWith("not-found") || moduleId.endsWith("error")) {
    void vscode.window.showInformationMessage("Este arquivo DRX não possui loader C# próprio.");
    return;
  }
  const files = await vscode.workspace.findFiles(new vscode.RelativePattern(workspace, "Server/**/*.cs"), "**/{bin,obj}/**", 10_000);
  for (const file of files) {
    const content = Buffer.from(await vscode.workspace.fs.readFile(file)).toString("utf8");
    if (content.includes(`DotReactPage(\"${moduleId}\"`) || content.includes(`\"${moduleId}\")`)) {
      await vscode.window.showTextDocument(file);
      return;
    }
  }
  void vscode.window.showWarningMessage(`Loader C# não encontrado para ${moduleId}.`);
}

function checkProject(document, diagnostics) {
  const target = document ?? vscode.window.activeTextEditor?.document;
  if (!target) return;
  const workspace = workspaceFor(target);
  if (!workspace) return;
  const root = workspace.uri.fsPath;
  const script = path.join(root, "node_modules", "@dotreact", "vite", "dist", "check-cli.js");
  if (!fs.existsSync(script)) {
    void vscode.window.showWarningMessage("Execute npm install para habilitar o checker DotReact.");
    return;
  }
  cp.execFile(process.execPath, [script, "--project", "tsconfig.json", "--manifest", "src/backend-manifest.json", "--contracts", "src/contracts.ts"],
    { cwd: root, windowsHide: true, maxBuffer: 1024 * 1024 }, async (error, stdout, stderr) => {
      diagnostics.clear();
      const grouped = new Map();
      for (const diagnostic of parseDiagnostics(stderr, root)) {
        const uri = vscode.Uri.file(diagnostic.filePath);
        const line = diagnostic.line;
        const column = diagnostic.column;
        const severity = diagnostic.severity === "warning" ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Error;
        const values = grouped.get(uri.toString()) ?? { uri, items: [] };
        values.items.push(new vscode.Diagnostic(new vscode.Range(line, column, line, column + 1), diagnostic.message, severity));
        grouped.set(uri.toString(), values);
      }
      for (const { uri, items } of grouped.values()) diagnostics.set(uri, items);
      if (!error) void vscode.window.setStatusBarMessage(stdout.trim() || "DotReact check passou.", 4000);
      else if (grouped.size === 0) void vscode.window.showErrorMessage(stderr.trim() || error.message);
    });
}

function activate(context) {
  const diagnostics = vscode.languages.createDiagnosticCollection("dotreact");
  context.subscriptions.push(
    diagnostics,
    vscode.commands.registerTextEditorCommand("dotreact.openBackendLoader", editor => openBackendLoader(editor.document)),
    vscode.commands.registerCommand("dotreact.checkProject", () => checkProject(undefined, diagnostics)),
    vscode.workspace.onDidSaveTextDocument(document => {
      if (document.uri.fsPath.endsWith(".drx") && vscode.workspace.getConfiguration("dotreact").get("checkOnSave", true))
        checkProject(document, diagnostics);
    }),
    vscode.languages.registerCodeLensProvider({ language: "typescriptreact", pattern: "**/*.drx" }, {
      provideCodeLenses(document) {
        return [new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
          title: "$(symbol-class) Abrir loader C#",
          command: "dotreact.openBackendLoader",
          arguments: [document]
        })];
      }
    })
  );
}

module.exports = { activate };
