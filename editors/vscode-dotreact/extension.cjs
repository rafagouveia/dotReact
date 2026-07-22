const cp = require("node:child_process");
const path = require("node:path");
const vscode = require("vscode");
const {
  checkerArguments,
  createCoalescingScheduler,
  moduleIdForPath,
  parseDiagnostics,
  resolveCheckerPath
} = require("./core.cjs");

const docsUri = vscode.Uri.parse("https://rafagouveia.github.io/dotReact/#vscode-extension");

function workspaceFor(document) {
  return vscode.workspace.getWorkspaceFolder(document.uri);
}

async function fileExists(uri) {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function openBackendLoader(document) {
  const workspace = workspaceFor(document);
  if (!workspace) return;
  const moduleId = moduleIdForPath(workspace.uri.fsPath, document.uri.fsPath);
  if (!moduleId || moduleId.endsWith("layout") || moduleId.endsWith("not-found") || moduleId.endsWith("error")) {
    void vscode.window.showInformationMessage("Este arquivo DRX não possui loader C# próprio.");
    return;
  }

  const colocated = document.uri.with({ path: document.uri.path.slice(0, -4) + ".server.cs" });
  if (await fileExists(colocated)) {
    await vscode.window.showTextDocument(colocated);
    return;
  }

  const files = await vscode.workspace.findFiles(
    new vscode.RelativePattern(workspace, "{app,Server}/**/*.cs"),
    "**/{bin,obj,vendor,node_modules}/**",
    2_000
  );
  for (const file of files) {
    const content = Buffer.from(await vscode.workspace.fs.readFile(file)).toString("utf8");
    if (content.includes(`DotReactPage(\"${moduleId}\"`) || content.includes(`\"${moduleId}\")`)) {
      await vscode.window.showTextDocument(file);
      return;
    }
  }
  void vscode.window.showWarningMessage(`Loader C# não encontrado para ${moduleId}.`);
}

class ProjectValidator {
  constructor(context) {
    this.diagnostics = vscode.languages.createDiagnosticCollection("dotreact");
    this.output = vscode.window.createOutputChannel("DotReact", { log: true });
    this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 20);
    this.status.name = "DotReact project health";
    this.status.command = "dotreact.showOutput";
    this.status.text = "$(check) DotReact";
    this.status.tooltip = "DotReact project diagnostics";
    this.status.show();
    this.schedulers = new Map();
    this.diagnosticUris = new Map();
    context.subscriptions.push(this, this.diagnostics, this.output, this.status);
  }

  schedulerFor(workspace) {
    const root = workspace.uri.fsPath;
    let scheduler = this.schedulers.get(root);
    if (!scheduler) {
      const configured = vscode.workspace.getConfiguration("dotreact", workspace.uri)
        .get("validation.debounceMs", 350);
      const delay = Math.max(100, Math.min(2_000, Number(configured) || 350));
      scheduler = createCoalescingScheduler(() => this.run(workspace), delay);
      this.schedulers.set(root, scheduler);
    }
    return scheduler;
  }

  schedule(document) {
    const workspace = workspaceFor(document);
    if (workspace) this.schedulerFor(workspace).schedule();
  }

  async check(document) {
    const target = document ?? vscode.window.activeTextEditor?.document;
    const workspace = target ? workspaceFor(target) : vscode.workspace.workspaceFolders?.[0];
    if (!workspace) {
      void vscode.window.showWarningMessage("Abra uma pasta DotReact antes de executar a verificação.");
      return;
    }
    await this.schedulerFor(workspace).runNow();
  }

  clearWorkspace(root) {
    for (const uri of this.diagnosticUris.get(root) ?? []) this.diagnostics.delete(uri);
    this.diagnosticUris.delete(root);
  }

  async run(workspace) {
    if (!vscode.workspace.isTrusted) {
      this.status.text = "$(shield) DotReact restrito";
      this.status.tooltip = "Confie no workspace para executar o checker local.";
      this.output.warn("Validation skipped because the workspace is not trusted.");
      return;
    }

    const root = workspace.uri.fsPath;
    const script = resolveCheckerPath(root);
    if (!script) {
      this.status.text = "$(warning) DotReact sem checker";
      this.status.tooltip = "Execute npm install para habilitar a validação DRX.";
      this.output.warn(`Checker not found under ${root}.`);
      void vscode.window.showWarningMessage("Execute npm install para habilitar o checker DotReact.");
      return;
    }

    this.status.text = "$(sync~spin) DotReact verificando";
    this.status.tooltip = "Verificação semântica DRX em andamento.";
    const startedAt = Date.now();
    const result = await new Promise(resolve => {
      cp.execFile(
        process.execPath,
        [script, ...checkerArguments()],
        { cwd: root, windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout: 60_000 },
        (error, stdout, stderr) => resolve({ error, stdout, stderr })
      );
    });

    this.clearWorkspace(root);
    const grouped = new Map();
    for (const diagnostic of parseDiagnostics(result.stderr, root)) {
      const uri = vscode.Uri.file(diagnostic.filePath);
      const severity = diagnostic.severity === "warning"
        ? vscode.DiagnosticSeverity.Warning
        : vscode.DiagnosticSeverity.Error;
      const values = grouped.get(uri.toString()) ?? { uri, items: [] };
      const item = new vscode.Diagnostic(
        new vscode.Range(diagnostic.line, diagnostic.column, diagnostic.line, diagnostic.column + 1),
        diagnostic.message,
        severity
      );
      item.source = "DotReact";
      item.code = "DRX";
      values.items.push(item);
      grouped.set(uri.toString(), values);
    }
    const ownedUris = [];
    for (const { uri, items } of grouped.values()) {
      this.diagnostics.set(uri, items);
      ownedUris.push(uri);
    }
    this.diagnosticUris.set(root, ownedUris);

    const elapsed = Date.now() - startedAt;
    if (!result.error) {
      const message = result.stdout.trim() || "DotReact check passou.";
      this.status.text = "$(pass-filled) DotReact pronto";
      this.status.tooltip = `${message} (${elapsed} ms)`;
      this.output.info(`${message} (${elapsed} ms)`);
      void vscode.window.setStatusBarMessage(`$(pass-filled) ${message}`, 4_000);
      return;
    }

    this.status.text = `$(error) DotReact ${grouped.size || "erro"}`;
    this.status.tooltip = `${grouped.size} arquivo(s) com diagnóstico. Clique para abrir o log.`;
    this.output.error(result.stderr.trim() || result.error.message);
    if (grouped.size === 0)
      void vscode.window.showErrorMessage(result.stderr.trim() || result.error.message, "Abrir log")
        .then(action => { if (action) this.output.show(true); });
  }

  showOutput() {
    this.output.show(true);
  }

  dispose() {
    for (const scheduler of this.schedulers.values()) scheduler.dispose();
    this.schedulers.clear();
  }
}

function activate(context) {
  const validator = new ProjectValidator(context);
  context.subscriptions.push(
    vscode.commands.registerTextEditorCommand("dotreact.openBackendLoader", editor => openBackendLoader(editor.document)),
    vscode.commands.registerCommand("dotreact.checkProject", () => validator.check()),
    vscode.commands.registerCommand("dotreact.showOutput", () => validator.showOutput()),
    vscode.commands.registerCommand("dotreact.openDocumentation", () => vscode.env.openExternal(docsUri)),
    vscode.workspace.onDidSaveTextDocument(document => {
      if (document.uri.scheme === "file" && document.uri.fsPath.endsWith(".drx")
        && vscode.workspace.getConfiguration("dotreact", document.uri).get("checkOnSave", true))
        validator.schedule(document);
    }),
    vscode.workspace.onDidChangeConfiguration(event => {
      if (!event.affectsConfiguration("dotreact.validation.debounceMs")) return;
      validator.dispose();
    }),
    vscode.languages.registerCodeLensProvider({ language: "typescriptreact", scheme: "file", pattern: "**/*.drx" }, {
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
