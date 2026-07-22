import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const root = resolve(".");
const frameworkLicense = readFileSync(join(root, "LICENSE"), "utf8");
const packageDirectories = readdirSync(join(root, "packages"), { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => join(root, "packages", entry.name));
const distributedPackages = [
  ...packageDirectories,
  join(root, "editors", "vscode-dotreact"),
];

test("all framework packages publish the MPL 2.0 license", () => {
  const rootManifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(rootManifest.license, "MPL-2.0");

  for (const directory of distributedPackages) {
    const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
    assert.equal(manifest.license, "MPL-2.0", `${manifest.name} has license drift`);
    assert.equal(readFileSync(join(directory, "LICENSE"), "utf8"), frameworkLicense,
      `${manifest.name} does not ship the canonical license text`);
  }

  assert.match(readFileSync(join(root, "dotnet", "Directory.Build.props"), "utf8"),
    /<PackageLicenseExpression>MPL-2\.0<\/PackageLicenseExpression>/);
});

test("generated applications preserve attribution without inheriting a source license", () => {
  const notice = readFileSync(join(root, "examples", "starter", "THIRD-PARTY-NOTICES.md"), "utf8");
  assert.match(notice, /Copyright © 2026 Black Red Solutions/);
  assert.match(notice, /Mozilla Public License 2\.0/);
  assert.match(notice, /application may be licensed separately/i);
});
