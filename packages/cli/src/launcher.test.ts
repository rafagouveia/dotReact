import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveProjectCli } from "./launcher.js";

function temporaryProject(): string {
  return mkdtempSync(path.join(tmpdir(), "dotreact-launcher-"));
}

test("global launcher selects the nearest explicitly declared project CLI", () => {
  const root = temporaryProject();
  try {
    const localBin = path.join(root, "node_modules", "@rafagouveia", "dotreact-cli", "bin", "dotreact.js");
    mkdirSync(path.dirname(localBin), { recursive: true });
    mkdirSync(path.join(root, "app", "reports"), { recursive: true });
    writeFileSync(path.join(root, "package.json"), JSON.stringify({
      devDependencies: { "@rafagouveia/dotreact-cli": "0.1.3" }
    }));
    writeFileSync(localBin, "#!/usr/bin/env node\n");
    assert.equal(resolveProjectCli(path.join(root, "app", "reports"), path.join(root, "global.js")), localBin);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("global launcher does not execute undeclared or current package bins", () => {
  const root = temporaryProject();
  try {
    const localBin = path.join(root, "node_modules", "@rafagouveia", "dotreact-cli", "bin", "dotreact.js");
    mkdirSync(path.dirname(localBin), { recursive: true });
    writeFileSync(localBin, "#!/usr/bin/env node\n");
    writeFileSync(path.join(root, "package.json"), JSON.stringify({ dependencies: {} }));
    assert.equal(resolveProjectCli(root, path.join(root, "global.js")), undefined);

    writeFileSync(path.join(root, "package.json"), JSON.stringify({
      dependencies: { "@rafagouveia/dotreact-cli": "0.1.3" }
    }));
    assert.equal(resolveProjectCli(root, localBin), undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("global launcher fails closed when the declared project CLI is not installed", () => {
  const root = temporaryProject();
  try {
    writeFileSync(path.join(root, "package.json"), JSON.stringify({
      devDependencies: { "@rafagouveia/dotreact-cli": "0.1.3" }
    }));
    assert.throws(() => resolveProjectCli(root, path.join(root, "global.js")), /Run npm install/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
