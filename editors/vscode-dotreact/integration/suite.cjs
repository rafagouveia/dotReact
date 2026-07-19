const assert = require("node:assert/strict");
const vscode = require("vscode");

async function run() {
  const root = vscode.Uri.joinPath(
    vscode.Uri.file(require("node:os").tmpdir()),
    `dotreact-vscode-${process.pid}-${Date.now()}`);
  const page = vscode.Uri.joinPath(root, "page.drx");
  try {
    await vscode.workspace.fs.createDirectory(root);
    await vscode.workspace.fs.writeFile(page, Buffer.from(
      "export default function Page() { return <main>DotReact</main>; }\n", "utf8"));
    const document = await vscode.workspace.openTextDocument(page);
    await vscode.window.showTextDocument(document);

    assert.equal(document.languageId, "typescriptreact");
    const extension = vscode.extensions.getExtension("dotreact.dotreact-vscode");
    assert.ok(extension, "DotReact extension was not installed in the extension host");
    await extension.activate();
    assert.equal(extension.isActive, true);

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("dotreact.checkProject"));
    assert.ok(commands.includes("dotreact.openBackendLoader"));
  } finally {
    await vscode.workspace.fs.delete(root, { recursive: true, useTrash: false });
  }
}

module.exports = { run };

