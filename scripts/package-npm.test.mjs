import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("private npm publishing resumes safely and tags experimental versions", () => {
  const directory = mkdtempSync(join(tmpdir(), "dotreact-package-publisher-"));
  try {
    const fakeNpm = join(directory, "fake-npm.mjs");
    const log = join(directory, "calls.jsonl");
    writeFileSync(fakeNpm, `
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(process.env.FAKE_NPM_LOG, JSON.stringify(args) + "\\n");
if (args[0] === "view" && args[1] === "@rafagouveia/dotreact-protocol@0.1.2") process.exit(0);
if (args[0] === "view") { process.stderr.write("npm error code E404\\n"); process.exit(1); }
process.exit(args[0] === "publish" ? 0 : 2);
`);
    const result = spawnSync(process.execPath, [resolve("scripts/package-npm.mjs"), "publish"], {
      cwd: resolve("."),
      encoding: "utf8",
      env: {
        ...process.env,
        npm_execpath: fakeNpm,
        NODE_AUTH_TOKEN: "test-token",
        FAKE_NPM_LOG: log
      }
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /dotreact-protocol@0\.1\.2 already exists; skipping/);
    const calls = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line));
    assert.equal(calls.filter(call => call[0] === "view").length, 10);
    assert.equal(calls.some(call => call[0] === "publish" && call.includes("@rafagouveia/dotreact-protocol")), false);
    const experimental = calls.find(call => call[0] === "publish" && call.includes("@rafagouveia/dotreact-rsc"));
    assert.deepEqual(experimental?.slice(-2), ["--tag", "experimental"]);
    const stable = calls.find(call => call[0] === "publish" && call.includes("@rafagouveia/dotreact-cli"));
    assert.deepEqual(stable?.slice(-2), ["--tag", "latest"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
