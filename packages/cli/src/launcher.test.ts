import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { resolveProjectCli } from "./launcher.js";

const packagedBin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../bin/dotreact.js");

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
    writeFileSync(path.join(root, "node_modules", "@rafagouveia", "dotreact-cli", "package.json"), JSON.stringify({ version: "0.1.3" }));
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
    writeFileSync(path.join(root, "node_modules", "@rafagouveia", "dotreact-cli", "package.json"), JSON.stringify({ version: "0.1.3" }));
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

test("workspace launcher accepts an aligned CLI hoisted to a parent node_modules", () => {
  const root = temporaryProject();
  try {
    const workspace = path.join(root, "examples", "app");
    const hoistedBin = path.join(root, "node_modules", "@rafagouveia", "dotreact-cli", "bin", "dotreact.js");
    mkdirSync(workspace, { recursive: true });
    mkdirSync(path.dirname(hoistedBin), { recursive: true });
    writeFileSync(path.join(workspace, "package.json"), JSON.stringify({
      devDependencies: { "@rafagouveia/dotreact-cli": "0.1.4" }
    }));
    writeFileSync(path.join(root, "package.json"), JSON.stringify({
      dependencies: { "@rafagouveia/dotreact-cli": "0.1.4" }
    }));
    writeFileSync(path.join(root, "node_modules", "@rafagouveia", "dotreact-cli", "package.json"), JSON.stringify({ version: "0.1.4" }));
    writeFileSync(hoistedBin, "#!/usr/bin/env node\n");
    assert.equal(resolveProjectCli(workspace, path.join(root, "global", "dotreact.js")), hoistedBin);
    assert.equal(resolveProjectCli(workspace, hoistedBin), undefined,
      "the delegated local launcher must not recurse into itself");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("packaged global launcher delegates arguments, cwd and exit status to the local CLI", () => {
  const root = temporaryProject();
  try {
    const localBin = path.join(root, "node_modules", "@rafagouveia", "dotreact-cli", "bin", "dotreact.js");
    mkdirSync(path.dirname(localBin), { recursive: true });
    writeFileSync(path.join(root, "package.json"), JSON.stringify({
      devDependencies: { "@rafagouveia/dotreact-cli": "0.1.2" }
    }));
    writeFileSync(path.join(root, "node_modules", "@rafagouveia", "dotreact-cli", "package.json"), JSON.stringify({ version: "0.1.2" }));
    writeFileSync(localBin, "process.stdout.write(JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() })); process.exit(7);\n");
    const result = spawnSync(process.execPath, [packagedBin, "doctor", "--probe"], {
      cwd: root,
      encoding: "utf8"
    });
    assert.equal(result.status, 7);
    assert.deepEqual(JSON.parse(result.stdout), { args: ["doctor", "--probe"], cwd: root });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
