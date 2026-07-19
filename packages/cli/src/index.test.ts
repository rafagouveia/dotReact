import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { benchmarkUrl, formatBenchmark } from "./benchmark.js";

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), "index.js");

test("help lists the complete project lifecycle", () => {
  const result = spawnSync(process.execPath, [cli, "help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  for (const command of ["create", "templates", "generate", "sync", "dev", "build", "analyze", "benchmark", "check", "start", "doctor"])
    assert.match(result.stdout, new RegExp(`dotreact ${command}`));
});

test("SSR benchmark calculates percentiles and failure rate without leaking response data", async () => {
  let count = 0;
  const result = await benchmarkUrl({ url: "http://127.0.0.1:5080/", requests: 20, concurrency: 4, warmup: 2, timeoutMs: 1000 },
    async () => ({ ok: ++count % 7 !== 0 }));
  assert.equal(result.requests, 20);
  assert.equal(result.failures, 3);
  assert.ok(result.p50Ms >= 0);
  assert.match(formatBenchmark(result), /p50 .* p95 .* p99/);
});

test("generator dry-run is side-effect free and page generation is fail-closed", () => {
  const directory = createProjectFixture();
  try {
    const dryRun = spawnSync(process.execPath, [cli, "generate", "page", "catalog/[slug]", "--dry-run"],
      { cwd: directory, encoding: "utf8" });
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /No files were written/);
    assert.equal(existsSync(path.join(directory, "src/pages/catalog/[slug]/page.drx")), false);

    const generated = spawnSync(process.execPath, [cli, "generate", "page", "catalog/[slug]"],
      { cwd: directory, encoding: "utf8" });
    assert.equal(generated.status, 0, generated.stderr);
    assert.match(readFileSync(path.join(directory, "src/pages/catalog/[slug]/page.drx"), "utf8"), /CatalogBySlugPageProps/);
    assert.match(readFileSync(path.join(directory, "Server/Pages/Catalog/BySlug/page.drx.cs"), "utf8"),
      /DotReactPage\("catalog\/\[slug\]\/page"\)/);

    const collision = spawnSync(process.execPath, [cli, "generate", "page", "catalog/[slug]"],
      { cwd: directory, encoding: "utf8" });
    assert.equal(collision.status, 1);
    assert.match(collision.stderr, /Refusing to overwrite/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("generator rejects traversal and creates typed action and boundary artifacts", () => {
  const directory = createProjectFixture();
  try {
    const traversal = spawnSync(process.execPath, [cli, "generate", "page", "../escape"],
      { cwd: directory, encoding: "utf8" });
    assert.equal(traversal.status, 1);
    assert.match(traversal.stderr, /Routes may contain/);

    const windowsTraversal = spawnSync(process.execPath, [cli, "generate", "page", "..\\escape"],
      { cwd: directory, encoding: "utf8" });
    assert.equal(windowsTraversal.status, 1);
    assert.match(windowsTraversal.stderr, /portable project-relative path/);

    const action = spawnSync(process.execPath, [cli, "add", "action", "SaveProduct"],
      { cwd: directory, encoding: "utf8" });
    assert.equal(action.status, 0, action.stderr);
    assert.match(readFileSync(path.join(directory, "Server/Actions/SaveProductAction.cs"), "utf8"),
      /DotReactAction\("save-product"\)/);

    const boundary = spawnSync(process.execPath, [cli, "generate", "boundary", "catalog", "--kind", "error"],
      { cwd: directory, encoding: "utf8" });
    assert.equal(boundary.status, 0, boundary.stderr);
    assert.equal(existsSync(path.join(directory, "src/pages/catalog/error.drx")), true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("bundle analyzer reports gzip sizes and enforces budgets", () => {
  const directory = createProjectFixture();
  try {
    mkdirSync(path.join(directory, "dist/client"), { recursive: true });
    mkdirSync(path.join(directory, "dist/server"), { recursive: true });
    writeFileSync(path.join(directory, "dist/client/client.js"), "export const value = 'small';\n");
    writeFileSync(path.join(directory, "dist/server/server.js"), "export const render = () => '';\n");
    const success = spawnSync(process.execPath, [cli, "analyze"], { cwd: directory, encoding: "utf8" });
    assert.equal(success.status, 0, success.stderr);
    assert.match(success.stdout, /Bundle budgets passed/);
    const failure = spawnSync(process.execPath, [cli, "analyze", "--max-client-kb", "0.001"],
      { cwd: directory, encoding: "utf8" });
    assert.equal(failure.status, 1);
    assert.match(failure.stderr, /Bundle budget failed/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("minimal template is self-contained and omits demo actions and routes", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dotreact-create-"));
  try {
    const result = spawnSync(process.execPath, [cli, "create", "minimal-app", "--template", "minimal"],
      { cwd: directory, encoding: "utf8", timeout: 30_000 });
    assert.equal(result.status, 0, result.stderr);
    const app = path.join(directory, "minimal-app");
    assert.equal(existsSync(path.join(app, "Dockerfile")), true);
    assert.equal(existsSync(path.join(app, ".git")), false);
    for (const repositoryFile of [
      ".gitignore", ".gitattributes", ".editorconfig", ".dockerignore", ".npmrc", ".nvmrc",
      "global.json", "Directory.Build.props", ".github/workflows/ci.yml"
    ]) assert.equal(existsSync(path.join(app, repositoryFile)), true, `missing ${repositoryFile}`);
    const gitignore = readFileSync(path.join(app, ".gitignore"), "utf8");
    assert.match(gitignore, /node_modules\//);
    assert.match(gitignore, /\[Bb\]in\//);
    assert.match(gitignore, /\.dotreact\//);
    assert.match(gitignore, /!\.env\.example/);
    assert.equal(existsSync(path.join(app, "framework/DotReact.AspNetCore/DotReact.AspNetCore.csproj")), true);
    assert.equal(existsSync(path.join(app, "framework/cli/package.json")), true);
    const generatedPackage = JSON.parse(readFileSync(path.join(app, "package.json"), "utf8"));
    assert.equal(generatedPackage.devDependencies["@dotreact/cli"], "file:framework/cli");
    assert.equal(generatedPackage.scripts.drx, "dotreact");
    assert.equal(existsSync(path.join(app, "Server/Actions")), false);
    assert.equal(existsSync(path.join(app, "src/pages/products")), false);
    assert.match(readFileSync(path.join(app, "src/pages/page.drx"), "utf8"), /minimal template/);
    assert.doesNotMatch(readFileSync(path.join(app, "src/contracts.ts"), "utf8"), /ProductPageProps/);
    const manifest = JSON.parse(readFileSync(path.join(app, "src/backend-manifest.json"), "utf8"));
    assert.equal(manifest.pages.length, 1);
    assert.equal(manifest.actions.length, 0);
    assert.match(readFileSync(path.join(app, "README.md"), "utf8"), /dotreact generate page/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

function createProjectFixture(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "dotreact-cli-project-"));
  mkdirSync(path.join(directory, "Server"), { recursive: true });
  mkdirSync(path.join(directory, "src"), { recursive: true });
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ scripts: {} }));
  writeFileSync(path.join(directory, "Server/Server.csproj"), "<Project />");
  writeFileSync(path.join(directory, "src/entry-server.tsx"), "export {};\n");
  return directory;
}

test("project commands fail closed outside a DotReact project", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dotreact-cli-"));
  try {
    const result = spawnSync(process.execPath, [cli, "doctor"], { cwd: directory, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not a DotReact project/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
