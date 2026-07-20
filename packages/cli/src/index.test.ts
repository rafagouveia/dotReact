import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { benchmarkUrl, formatBenchmark } from "./benchmark.js";
import { parsePrerenderManifest, validateStaticRoutes } from "./static-export.js";

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), "index.js");

test("static export validates and consumes the server-generated prerender manifest", () => {
  const manifest = parsePrerenderManifest({
    version: 1,
    buildId: "build-1",
    routes: [{ path: "/products/1", moduleId: "products/[id]/page", revalidateSeconds: 60, tags: ["products"] }]
  });
  assert.deepEqual(validateStaticRoutes(manifest.routes.map(route => route.path)), ["/products/1"]);
  assert.throws(() => parsePrerenderManifest({ version: 1, buildId: "x", routes: [{ path: "//evil" }] }),
    /invalid DotReact prerender manifest route/);
  assert.throws(() => validateStaticRoutes(["/safe?leak=1"]), /canonical local paths/);
});

test("help lists the complete project lifecycle", () => {
  const result = spawnSync(process.execPath, [cli, "help"], { encoding: "utf8" });
  assert.equal(result.status, 0);
  for (const command of ["create", "templates", "generate", "sync", "dev", "build", "analyze", "benchmark", "check", "start", "doctor", "upgrade", "workspace"])
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
    assert.equal(existsSync(path.join(directory, "app/catalog/[slug]/page.drx")), false);

    const generated = spawnSync(process.execPath, [cli, "generate", "page", "catalog/[slug]"],
      { cwd: directory, encoding: "utf8" });
    assert.equal(generated.status, 0, generated.stderr);
    assert.match(readFileSync(path.join(directory, "app/catalog/[slug]/page.drx"), "utf8"), /CatalogBySlugPageProps/);
    const loader = readFileSync(path.join(directory, "app/catalog/[slug]/page.server.cs"), "utf8");
    assert.match(loader, /app router derives this page's route/);
    assert.doesNotMatch(loader, /\[DotReactPage/);

    const grouped = spawnSync(process.execPath,
      [cli, "generate", "page", "(operations)/reports/[...slug]"],
      { cwd: directory, encoding: "utf8" });
    assert.equal(grouped.status, 0, grouped.stderr);
    const groupedLoader = readFileSync(
      path.join(directory, "app/(operations)/reports/[...slug]/page.server.cs"), "utf8");
    assert.match(groupedLoader, /class OperationsReportsBySlugPage/);
    assert.match(groupedLoader, /namespace DotReact\.App\.Routes\.GroupOperations\.Reports\.CatchAllSlug/);

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

    const privateRoute = spawnSync(process.execPath, [cli, "generate", "page", "_components/example"],
      { cwd: directory, encoding: "utf8" });
    assert.equal(privateRoute.status, 1);
    assert.match(privateRoute.stderr, /routeGroup/);

    const action = spawnSync(process.execPath, [cli, "add", "action", "SaveProduct"],
      { cwd: directory, encoding: "utf8" });
    assert.equal(action.status, 0, action.stderr);
    const actionSource = readFileSync(path.join(directory, "Server/Actions/SaveProductAction.cs"), "utf8");
    assert.match(actionSource, /DotReactAction\("save-product"\)/);
    assert.doesNotMatch(actionSource, /AllowAnonymous/);
    assert.match(actionSource, /Authorization is required by default/);
    assert.match(actionSource, /Authorize\(Policy/);

    const boundary = spawnSync(process.execPath, [cli, "generate", "boundary", "catalog", "--kind", "error"],
      { cwd: directory, encoding: "utf8" });
    assert.equal(boundary.status, 0, boundary.stderr);
    assert.equal(existsSync(path.join(directory, "app/catalog/error.drx")), true);

    const globalBoundary = spawnSync(process.execPath, [cli, "generate", "boundary", "--kind", "global-error"],
      { cwd: directory, encoding: "utf8" });
    assert.equal(globalBoundary.status, 0, globalBoundary.stderr);
    const globalBoundarySource = readFileSync(path.join(directory, "app/global-error.drx"), "utf8");
    assert.match(globalBoundarySource, /DotReactGlobalErrorProps/);
    assert.match(globalBoundarySource, /onClick=\{reset\}/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("bundle analyzer reports gzip sizes and enforces budgets", () => {
  const directory = createProjectFixture();
  try {
    mkdirSync(path.join(directory, "dist/client"), { recursive: true });
    mkdirSync(path.join(directory, "dist/client/.vite"), { recursive: true });
    mkdirSync(path.join(directory, "dist/server"), { recursive: true });
    writeFileSync(path.join(directory, "dist/client/client.js"), "export const value = 'small';\n");
    writeFileSync(path.join(directory, "dist/client/route.js"), `export const route = '${"x".repeat(2_048)}';\n`);
    writeFileSync(path.join(directory, "dist/client/.vite/manifest.json"), JSON.stringify({
      "virtual:entry": { file: "client.js", isEntry: true, dynamicImports: ["app/page"] },
      "app/page": { file: "route.js", isDynamicEntry: true }
    }));
    writeFileSync(path.join(directory, "dist/server/server.js"), "export const render = () => '';\n");
    const success = spawnSync(process.execPath, [cli, "analyze"], { cwd: directory, encoding: "utf8" });
    assert.equal(success.status, 0, success.stderr);
    assert.match(success.stdout, /Bundle budgets passed/);
    assert.match(success.stdout, /initial JS/);
    assert.match(success.stdout, /largest async/);
    const failure = spawnSync(process.execPath, [cli, "analyze", "--max-client-kb", "0.001"],
      { cwd: directory, encoding: "utf8" });
    assert.equal(failure.status, 1);
    assert.match(failure.stderr, /Bundle budget failed/);
    const asyncFailure = spawnSync(process.execPath, [cli, "analyze", "--max-async-chunk-kb", "0.001"],
      { cwd: directory, encoding: "utf8" });
    assert.equal(asyncFailure.status, 1);
    assert.match(asyncFailure.stderr, /largest async chunk/);
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
      "global.json", "Directory.Build.props", ".env.example", "AGENTS.md",
      "docs/ai/PROJECT.md", "docs/ai/DOTREACT.md", "docs/ai/01-ARCHITECTURE.md",
      "docs/ai/02-DRX-ROUTING.md", "docs/ai/03-SSR-HYDRATION.md",
      "docs/ai/04-DATA-ACTIONS-SECURITY.md", "docs/ai/05-CACHING-PRODUCTION.md",
      "docs/ai/06-WORKFLOW-RECIPES.md", "docs/ai/07-SOLID-FEATURES.md",
      "docs/ai/08-AUTHENTICATION-SESSIONS.md",
      ".github/workflows/ci.yml", ".github/dependabot.yml", "scripts/audit-dotnet-packages.mjs",
      "deploy/azure/app-service.bicep", "deploy/azure/app-service.parameters.example.json",
      "deploy/azure/container-apps.bicep", "deploy/azure/container-apps.parameters.example.json",
      "deploy/azure/README.md"
    ]) assert.equal(existsSync(path.join(app, repositoryFile)), true, `missing ${repositoryFile}`);
    const gitignore = readFileSync(path.join(app, ".gitignore"), "utf8");
    assert.match(gitignore, /node_modules\//);
    assert.match(gitignore, /\[Bb\]in\//);
    assert.match(gitignore, /\.dotreact\//);
    assert.match(gitignore, /!\.env\.example/);
    assert.equal(existsSync(path.join(app, "vendor/DotReact.AspNetCore/DotReact.AspNetCore.csproj")), true);
    assert.equal(existsSync(path.join(app, "vendor/DotReact.Hosting/DotReact.Hosting.csproj")), true);
    assert.equal(existsSync(path.join(app, "vendor/DotReact.Images.SkiaSharp/DotReact.Images.SkiaSharp.csproj")), true);
    assert.equal(existsSync(path.join(app, "vendor/image/package.json")), true);
    assert.equal(existsSync(path.join(app, "vendor/font/package.json")), true);
    assert.equal(existsSync(path.join(app, "vendor/script/package.json")), true);
    assert.equal(existsSync(path.join(app, "vendor/adapter/package.json")), true);
    assert.equal(existsSync(path.join(app, "vendor/cli/package.json")), true);
    assert.equal(existsSync(path.join(app, "vendor/README.md")), true);
    assert.equal(existsSync(path.join(app, "vendor/dotreact-runtime.json")), true);
    assert.equal(existsSync(path.join(app, "vendor/cli/dist/index.js")), true,
      "the CLI executable must exist before npm links the dotreact bin");
    assert.equal(existsSync(path.join(app, "vendor/vite/dist/check-cli.js")), true,
      "the checker executable must exist before npm links the dotreact-check bin");
    const generatedPackage = JSON.parse(readFileSync(path.join(app, "package.json"), "utf8"));
    assert.equal(generatedPackage.devDependencies["@dotreact/cli"], "file:vendor/cli");
    assert.equal(generatedPackage.dependencies["@dotreact/image"], "file:vendor/image");
    assert.equal(generatedPackage.dependencies["@dotreact/font"], "file:vendor/font");
    assert.equal(generatedPackage.dependencies["@dotreact/script"], "file:vendor/script");
    assert.equal(generatedPackage.devDependencies["@dotreact/adapter"], "file:vendor/adapter");
    assert.equal(existsSync(path.join(app, "vendor/rsc")), false,
      "unused experimental RSC sources must not be vendored into stable scaffolds");
    assert.equal(existsSync(path.join(app, "vendor/DotReact.Redis/DotReact.Redis.csproj")), true);
    assert.equal(generatedPackage.scripts.drx, "dotreact");
    assert.match(generatedPackage.scripts.dev, /npm run generate/);
    assert.match(generatedPackage.scripts.dev, /npm:dev:contracts/);
    assert.equal(generatedPackage.scripts["dev:contracts"], "dotreact sync --watch");
    assert.equal(generatedPackage.scripts["build:ssr"], "vite build --ssr");
    assert.match(generatedPackage.scripts["dev:server"], /dotnet watch --project/);
    assert.doesNotMatch(generatedPackage.scripts["dev:server"], /--no-hot-reload/);
    assert.match(generatedPackage.scripts["dev:renderer"], /vendor\/renderer\/dist\/server\.js/);
    assert.match(generatedPackage.scripts.generate, /vendor\/DotReact\.TypeGen\/DotReact\.TypeGen\.csproj/);
    assert.match(generatedPackage.scripts.generate, /MinimalApp\.Server\.dll/);
    assert.match(generatedPackage.scripts["check:contracts"], /vendor\/DotReact\.TypeGen\/DotReact\.TypeGen\.csproj/);
    assert.match(generatedPackage.scripts["dotreact:runtime"], /vendor\/client/);
    assert.equal(generatedPackage.scripts["build:framework"], undefined);
    assert.equal(generatedPackage.scripts["audit:dotnet"], "node scripts/audit-dotnet-packages.mjs");
    assert.match(generatedPackage.scripts.verify, /audit:dotnet/);
    assert.equal(existsSync(path.join(app, "src/entry-server.tsx")), false);
    assert.doesNotMatch(readFileSync(path.join(app, "vite.config.ts"), "utf8"), /cssCodeSplit:\s*false/);
    const generatedCsproj = readFileSync(path.join(app, "Server/Server.csproj"), "utf8");
    assert.match(generatedCsproj, /\.\.\/vendor\/DotReact\.Hosting/);
    assert.match(generatedCsproj, /<RootNamespace>MinimalApp\.Server<\/RootNamespace>/);
    assert.match(generatedCsproj, /<AssemblyName>MinimalApp\.Server<\/AssemblyName>/);
    assert.doesNotMatch(generatedCsproj, /DotReact\.AspNetCore|DotReact\.Images\.SkiaSharp|DotReact\.Redis/,
      "application projects should reference the hosting facade instead of runtime internals");
    const dockerfile = readFileSync(path.join(app, "Dockerfile"), "utf8");
    assert.match(dockerfile, /RUN npm run generate && npm run build:client && npm run build:ssr/);
    assert.doesNotMatch(dockerfile, /RUN npm run dotreact:runtime/);
    assert.match(dockerfile, /MinimalApp\.Server\.dll/);
    const workflow = readFileSync(path.join(app, ".github/workflows/ci.yml"), "utf8");
    assert.match(workflow, /azure-infrastructure:/);
    assert.match(workflow, /az bicep build --file deploy\/azure\/container-apps\.bicep/);
    assert.match(workflow, /npm run audit:dotnet/);
    assert.doesNotMatch(workflow, /uses: [^\n]+@v[0-9]/);
    const envExample = readFileSync(path.join(app, ".env.example"), "utf8");
    assert.match(envExample, /DOTREACT_REDIS_CONNECTION=/);
    assert.doesNotMatch(envExample, /DOTREACT_REDIS_CONNECTION=\S+/);
    assert.match(envExample, /DOTREACT_REDIS_KEY_PREFIX=/);
    assert.doesNotMatch(envExample, /DOTREACT_REDIS_KEY_PREFIX=\S+/);
    assert.match(envExample, /Authentication__Google__ClientSecret=/);
    assert.doesNotMatch(envExample, /Authentication__Google__ClientSecret=\S+/);
    const agentInstructions = readFileSync(path.join(app, "AGENTS.md"), "utf8");
    assert.match(agentInstructions, /read the following files completely and in/);
    assert.match(agentInstructions, /06-WORKFLOW-RECIPES\.md/);
    assert.match(agentInstructions, /07-SOLID-FEATURES\.md/);
    assert.match(agentInstructions, /08-AUTHENTICATION-SESSIONS\.md/);
    assert.match(agentInstructions, /Treat `vendor\/` as an opaque, pinned runtime/);
    const vscodeSettings = readFileSync(path.join(app, ".vscode/settings.json"), "utf8");
    assert.match(vscodeSettings, /"vendor": true/);
    assert.match(vscodeSettings, /"src\/contracts\.ts": true/);
    assert.match(vscodeSettings, /"src\/actions\.ts": true/);
    assert.match(vscodeSettings, /"src\/backend-manifest\.json": true/);
    assert.match(vscodeSettings, /"Dockerfile": true/);
    assert.equal(existsSync(path.join(app, "src/entry-client.tsx")), false);
    assert.equal(existsSync(path.join(app, "app/error.drx")), false);
    assert.equal(existsSync(path.join(app, "app/not-found.drx")), false);
    assert.equal(existsSync(path.join(app, "app/loading.drx")), false);
    const focusedWorkspace = spawnSync(process.execPath, [cli, "workspace", "status"],
      { cwd: app, encoding: "utf8" });
    assert.equal(focusedWorkspace.status, 0, focusedWorkspace.stderr);
    assert.match(focusedWorkspace.stdout, /workspace: focus/);
    const revealedWorkspace = spawnSync(process.execPath, [cli, "workspace", "reveal"],
      { cwd: app, encoding: "utf8" });
    assert.equal(revealedWorkspace.status, 0, revealedWorkspace.stderr);
    assert.equal(JSON.parse(readFileSync(path.join(app, ".vscode/settings.json"), "utf8"))["files.exclude"].Dockerfile,
      undefined);
    const restoredWorkspace = spawnSync(process.execPath, [cli, "workspace", "focus"],
      { cwd: app, encoding: "utf8" });
    assert.equal(restoredWorkspace.status, 0, restoredWorkspace.stderr);
    assert.equal(JSON.parse(readFileSync(path.join(app, ".vscode/settings.json"), "utf8"))["files.exclude"].Dockerfile,
      true);
    const doctor = spawnSync(process.execPath, [cli, "doctor"], { cwd: app, encoding: "utf8" });
    assert.equal(doctor.status, 0, doctor.stderr);
    assert.match(doctor.stdout, /runtime=vendor\//);
    assert.match(doctor.stdout, /Managed runtime/);
    assert.match(readFileSync(path.join(app, "app/page.server.cs"), "utf8"), /namespace MinimalApp\.Pages\.Home/);
    assert.match(readFileSync(path.join(app, "src/backend-manifest.json"), "utf8"), /MinimalApp\.HomePageProps/);
    assert.match(readFileSync(path.join(app, "docs/ai/PROJECT.md"), "utf8"), /Product name: Minimal App/);
    assert.match(readFileSync(path.join(app, "README.md"), "utf8"), /^# Minimal App/m);

    writeFileSync(path.join(app, "app/application-owned.marker"), "keep\n");
    writeFileSync(path.join(app, "vendor/obsolete.marker"), "remove\n");
    const dryUpgrade = spawnSync(process.execPath, [cli, "upgrade", "--from", path.resolve(path.dirname(cli), "../../.."), "--dry-run"],
      { cwd: app, encoding: "utf8" });
    assert.equal(dryUpgrade.status, 0, dryUpgrade.stderr);
    assert.equal(existsSync(path.join(app, "vendor/obsolete.marker")), true);
    const upgrade = spawnSync(process.execPath, [cli, "upgrade", "--from", path.resolve(path.dirname(cli), "../../..")],
      { cwd: app, encoding: "utf8", timeout: 30_000 });
    assert.equal(upgrade.status, 0, upgrade.stderr);
    assert.equal(existsSync(path.join(app, "app/application-owned.marker")), true);
    assert.equal(existsSync(path.join(app, "vendor/obsolete.marker")), false);
    assert.equal(existsSync(path.join(app, "vendor/dotreact-runtime.json")), true);
    mkdirSync(path.join(app, "framework"));
    const ambiguousDoctor = spawnSync(process.execPath, [cli, "doctor"], { cwd: app, encoding: "utf8" });
    assert.equal(ambiguousDoctor.status, 1);
    assert.match(ambiguousDoctor.stderr, /Both vendor\/ and legacy framework\//);
    rmSync(path.join(app, "framework"), { recursive: true, force: true });
    const agentGuide = readFileSync(path.join(app, "docs/ai/DOTREACT.md"), "utf8");
    assert.match(agentGuide, /DRX is not a mixed C#\/JSX language/);
    assert.match(agentGuide, /generated TypeScript Server Action caller/);
    assert.match(readFileSync(path.join(app, "docs/ai/03-SSR-HYDRATION.md"), "utf8"),
      /Hydration contract/);
    assert.match(readFileSync(path.join(app, "docs/ai/04-DATA-ACTIONS-SECURITY.md"), "utf8"),
      /The only supported C# to React data path/);
    assert.match(readFileSync(path.join(app, "docs/ai/08-AUTHENTICATION-SESSIONS.md"), "utf8"),
      /Use `SignOutAsync` to revoke only the current device/);
    for (const file of projectFilesOutsideVendor(app)) {
      const content = readFileSync(file, "utf8");
      assert.doesNotMatch(content, /(?:\.\.[\\/])+(?:packages|dotnet)(?:[\\/]|$)/,
        `monorepo-relative path leaked into ${path.relative(app, file)}`);
    }
    assert.equal(existsSync(path.join(app, "Server/Actions")), false);
    assert.equal(existsSync(path.join(app, "app/products")), false);
    assert.equal(existsSync(path.join(app, "app/streaming")), false);
    assert.match(readFileSync(path.join(app, "app/page.drx"), "utf8"), /minimal template/);
    assert.doesNotMatch(readFileSync(path.join(app, "src/contracts.ts"), "utf8"), /ProductPageProps/);
    const manifest = JSON.parse(readFileSync(path.join(app, "src/backend-manifest.json"), "utf8"));
    assert.equal(manifest.pages.length, 1);
    assert.equal(manifest.actions.length, 0);
    assert.match(readFileSync(path.join(app, "README.md"), "utf8"), /dotreact generate page/);
    assert.match(readFileSync(path.join(app, "vite.config.ts"), "utf8"), /defineDotReactConfig/);
    assert.doesNotMatch(readFileSync(path.join(app, "vite.config.ts"), "utf8"),
      /entryFileNames|assetFileNames|dedupe|optimizeDeps/);
    const generatedProgram = readFileSync(path.join(app, "Server/Program.cs"), "utf8");
    assert.match(generatedProgram, /AddDotReactApplication/);
    assert.match(generatedProgram, /UseDotReactApplication/);
    assert.match(generatedProgram, /MapDotReactApplication/);
    assert.doesNotMatch(generatedProgram, /ClientStyleSrc|AddOpenTelemetry|AddDotReactNodeRenderer/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

function createProjectFixture(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "dotreact-cli-project-"));
  mkdirSync(path.join(directory, "Server"), { recursive: true });
  mkdirSync(path.join(directory, "app"), { recursive: true });
  mkdirSync(path.join(directory, "src"), { recursive: true });
  writeFileSync(path.join(directory, "package.json"), JSON.stringify({ scripts: {} }));
  writeFileSync(path.join(directory, "Server/Server.csproj"), "<Project />");
  writeFileSync(path.join(directory, "vite.config.ts"), "export default {};\n");
  return directory;
}

function projectFilesOutsideVendor(root: string): string[] {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "vendor") continue;
      const current = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(current);
      else if (entry.isFile()) files.push(current);
    }
  };
  visit(root);
  return files;
}

test("project commands fail closed outside a DotReact project", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dotreact-cli-"));
  try {
    const result = spawnSync(process.execPath, [cli, "doctor"], { cwd: directory, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /not a DotReact project/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
