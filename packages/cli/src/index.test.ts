import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  aggregateBenchmarkSamples,
  benchmarkUrl,
  compareBenchmarkResults,
  evaluateBenchmarkThresholds,
  formatBenchmark,
  formatBenchmarkComparison
} from "./benchmark.js";
import { parsePrerenderManifest, validateStaticRoutes } from "./static-export.js";
import { formatRouteDiagnostics, inspectRoutes } from "./routes.js";

const cli = path.join(path.dirname(fileURLToPath(import.meta.url)), "index.js");

function discoverPageModules(root: string, directory = root): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return discoverPageModules(root, fullPath);
    if (!entry.isFile() || entry.name !== "page.drx") return [];
    return [path.relative(root, fullPath).replaceAll(path.sep, "/").replace(/\.drx$/u, "")];
  });
}

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
  for (const command of ["create", "templates", "generate", "sync", "dev", "build", "analyze", "routes", "benchmark", "check", "start", "doctor", "upgrade", "workspace"])
    assert.match(result.stdout, new RegExp(`dotreact ${command}`));
});

test("route diagnostics explain dynamic SSR and client hydration without requiring a running host", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dotreact-routes-"));
  try {
    mkdirSync(path.join(directory, "src"));
    writeFileSync(path.join(directory, "src/backend-manifest.json"), JSON.stringify({
      schemaVersion: 2,
      pages: [{ moduleId: "reports/page", pattern: "/reports", routing: "app", propsType: "ReportsProps" }],
      actions: [{ id: "reports/save" }]
    }));
    const report = await inspectRoutes(directory);
    assert.equal(report.routes[0]?.pattern, "/reports");
    assert.equal(report.actionCount, 1);
    assert.match(formatRouteDiagnostics(report), /dynamic SSR/);
    assert.match(formatRouteDiagnostics(report), /production hydrates only routes that require browser behavior/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("SSR benchmark calculates percentiles and failure rate without leaking response data", async () => {
  let count = 0;
  const result = await benchmarkUrl({ url: "http://127.0.0.1:5080/", requests: 20, concurrency: 4, warmup: 2, timeoutMs: 1000 },
    async () => ({ ok: ++count % 7 !== 0, arrayBuffer: async () => new ArrayBuffer(4) }));
  assert.equal(result.requests, 20);
  assert.equal(result.failures, 3);
  assert.equal(result.failureRate, 0.15);
  assert.ok(result.meanMs >= 0);
  assert.equal(result.receivedBytes, 80);
  assert.ok(result.ttfbP95Ms >= 0);
  assert.ok(result.p50Ms >= 0);
  assert.match(formatBenchmark(result), /p50 .* p95 .* p99/);
});

test("comparative benchmark reports ratios and enforces explicit regression budgets", () => {
  const candidate = {
    requests: 100, failures: 0, failureRate: 0, durationMs: 1000,
    requestsPerSecond: 90, receivedBytes: 102_400, megabytesPerSecond: 0.1,
    meanMs: 8, ttfbP50Ms: 3, ttfbP95Ms: 4, p50Ms: 7, p95Ms: 12, p99Ms: 15
  };
  const baseline = {
    requests: 100, failures: 0, failureRate: 0, durationMs: 900,
    requestsPerSecond: 100, receivedBytes: 102_400, megabytesPerSecond: 0.11,
    meanMs: 7, ttfbP50Ms: 2, ttfbP95Ms: 3, p50Ms: 6, p95Ms: 10, p99Ms: 13
  };
  const comparison = compareBenchmarkResults(
    "http://candidate.test/", candidate, "http://baseline.test/", baseline);

  assert.equal(comparison.p95Ratio, 1.2);
  assert.equal(comparison.throughputRatio, 0.9);
  assert.match(formatBenchmarkComparison(comparison), /candidate \/ baseline/i);
  assert.deepEqual(evaluateBenchmarkThresholds(comparison, {
    maxP95Ratio: 1.1,
    minThroughputRatio: 0.95,
    maxFailureRate: 0
  }), [
    "candidate p95 ratio 1.200 exceeds 1.100",
    "candidate throughput ratio 0.900 is below 0.950"
  ]);
});

test("benchmark aggregation takes each metric median and reports dispersion", () => {
  const samples = [80, 100, 120].map((requestsPerSecond, index) => ({
    requests: 100, failures: 0, failureRate: 0, durationMs: 1000,
    requestsPerSecond, receivedBytes: 1000, megabytesPerSecond: 1,
    meanMs: 10, ttfbP50Ms: 2, ttfbP95Ms: 4,
    p50Ms: 8, p95Ms: 10 + index * 2, p99Ms: 20
  }));
  const aggregate = aggregateBenchmarkSamples(samples);
  assert.equal(aggregate.requestsPerSecond, 100);
  assert.equal(aggregate.p95Ms, 12);
  assert.equal(aggregate.throughputIqr, 40);
  assert.equal(aggregate.rounds, 3);
  assert.equal(aggregate.samples.length, 3);
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
    const actionSource = readFileSync(path.join(directory, "app/_actions/SaveProductAction.server.cs"), "utf8");
    assert.match(actionSource, /DotReactAction\("save-product"\)/);
    assert.doesNotMatch(actionSource, /AllowAnonymous/);
    assert.match(actionSource, /Authorization is required by default/);
    assert.match(actionSource, /Authorize\(Policy/);

    const component = spawnSync(process.execPath, [cli, "generate", "component", "ProductCard", "--route", "products"],
      { cwd: directory, encoding: "utf8" });
    assert.equal(component.status, 0, component.stderr);
    assert.equal(existsSync(path.join(directory, "app/products/_components/ProductCard.tsx")), true);

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
      "global.json", "Directory.Build.props", "NuGet.config", ".config/dotnet-tools.json", ".env.example", "AGENTS.md",
      "THIRD-PARTY-NOTICES.md",
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
    assert.match(readFileSync(path.join(app, "THIRD-PARTY-NOTICES.md"), "utf8"), /Mozilla Public License 2\.0/);
    const gitignore = readFileSync(path.join(app, ".gitignore"), "utf8");
    assert.match(gitignore, /node_modules\//);
    assert.match(gitignore, /\[Bb\]in\//);
    assert.match(gitignore, /\.dotreact\//);
    assert.match(gitignore, /\.next\//);
    assert.match(gitignore, /tmp\//);
    assert.match(gitignore, /\*\.har/);
    assert.match(gitignore, /secrets\.json/);
    assert.match(gitignore, /!\.env\.example/);
    const dockerignore = readFileSync(path.join(app, ".dockerignore"), "utf8");
    assert.match(dockerignore, /\*\*\/\.next/);
    assert.match(dockerignore, /^tmp$/m);
    assert.match(dockerignore, /\*\.har/);
    assert.equal(existsSync(path.join(app, "vendor")), false,
      "published package projects must not copy framework sources into the application");
    const generatedPackage = JSON.parse(readFileSync(path.join(app, "package.json"), "utf8"));
    assert.equal(generatedPackage.license, "UNLICENSED",
      "the framework must not choose a commercial application's source license");
    assert.equal(generatedPackage.devDependencies["@rafagouveia/dotreact-cli"], "0.1.4");
    assert.equal(generatedPackage.dependencies["@rafagouveia/dotreact-image"], "0.1.4");
    assert.equal(generatedPackage.dependencies["@rafagouveia/dotreact-font"], "0.1.4");
    assert.equal(generatedPackage.dependencies["@rafagouveia/dotreact-script"], "0.1.4");
    assert.equal(generatedPackage.scripts.postinstall, "dotnet tool restore");
    assert.equal(generatedPackage.scripts.drx, "dotreact");
    assert.match(generatedPackage.scripts.dev, /npm run generate/);
    assert.match(generatedPackage.scripts.dev, /npm:dev:contracts/);
    assert.equal(generatedPackage.scripts["dev:contracts"], "dotreact sync --watch");
    assert.equal(generatedPackage.scripts["build:ssr"], "vite build --ssr");
    assert.match(generatedPackage.scripts["dev:server"], /dotnet watch --project/);
    assert.match(generatedPackage.scripts["dev:server"], /DOTNET_WATCH_RESTART_ON_RUDE_EDIT=1/);
    assert.doesNotMatch(generatedPackage.scripts["dev:server"], /--no-hot-reload/);
    assert.match(generatedPackage.scripts["dev:renderer"], /node_modules\/@rafagouveia\/dotreact-renderer\/dist\/server\.js/);
    assert.match(generatedPackage.scripts.generate, /dotnet tool run dotreact-typegen/);
    assert.match(generatedPackage.scripts.generate, /MinimalApp\.Server\.dll/);
    assert.match(generatedPackage.scripts["check:contracts"], /dotnet tool run dotreact-typegen/);
    assert.equal(generatedPackage.scripts["dotreact:runtime"], undefined);
    assert.equal(generatedPackage.scripts["build:framework"], undefined);
    assert.equal(generatedPackage.scripts["audit:dotnet"], "node scripts/audit-dotnet-packages.mjs");
    assert.match(generatedPackage.scripts.analyze, /max-initial-client-kb 75/);
    assert.equal(generatedPackage.scripts["audit:lighthouse"], "node scripts/lighthouse-audit.mjs");
    assert.equal(generatedPackage.devDependencies.lighthouse, "13.4.1");
    assert.equal(existsSync(path.join(app, "lighthouserc.cjs")), true);
    assert.equal(existsSync(path.join(app, "scripts/lighthouse-audit.mjs")), true);
    assert.match(generatedPackage.scripts.verify, /audit:dotnet/);
    assert.match(generatedPackage.scripts.verify, /npm run analyze/);
    assert.equal(existsSync(path.join(app, "src/entry-server.tsx")), false);
    assert.doesNotMatch(readFileSync(path.join(app, "vite.config.ts"), "utf8"), /cssCodeSplit:\s*false/);
    const generatedCsproj = readFileSync(path.join(app, "Server/Server.csproj"), "utf8");
    assert.match(generatedCsproj, /<PackageReference Include="DotReact\.Hosting" Version="0\.1\.4"/);
    assert.match(generatedCsproj, /<PackageReference Include="DotReact\.AppGenerator" Version="0\.1\.4"/);
    assert.match(generatedCsproj, /PrivateAssets="all"/);
    assert.match(generatedCsproj, /<RootNamespace>MinimalApp\.Server<\/RootNamespace>/);
    assert.match(generatedCsproj, /<AssemblyName>MinimalApp\.Server<\/AssemblyName>/);
    assert.doesNotMatch(generatedCsproj, /DotReact\.AspNetCore|DotReact\.Images\.SkiaSharp|DotReact\.Redis/,
      "application projects should reference the hosting facade instead of runtime internals");
    const dockerfile = readFileSync(path.join(app, "Dockerfile"), "utf8");
    assert.match(dockerfile, /RUN npm run build/);
    assert.doesNotMatch(dockerfile, /RUN npm run dotreact:runtime/);
    assert.match(dockerfile, /node_modules\/@rafagouveia\/dotreact-renderer\/dist/);
    assert.match(dockerfile, /MinimalApp\.Server\.dll/);
    const workflow = readFileSync(path.join(app, ".github/workflows/ci.yml"), "utf8");
    assert.match(workflow, /azure-infrastructure:/);
    assert.match(workflow, /packages: read/);
    assert.match(workflow, /NODE_AUTH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/);
    assert.match(workflow, /NuGetPackageSourceCredentials_github-dotreact/);
    assert.match(workflow, /nuget_credentials=Username=/);
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
    assert.doesNotMatch(agentInstructions, /Treat `vendor\/` as an opaque, pinned runtime/);
    const vscodeSettings = readFileSync(path.join(app, ".vscode/settings.json"), "utf8");
    assert.match(vscodeSettings, /"NuGet\.config": true/);
    assert.match(vscodeSettings, /"\.config": true/);
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
    assert.match(doctor.stdout, /runtime=packages/);
    assert.match(doctor.stdout, /Published package runtime 0\.1\.4/);
    assert.match(readFileSync(path.join(app, "app/page.server.cs"), "utf8"), /namespace MinimalApp\.Pages\.Home/);
    assert.match(readFileSync(path.join(app, "src/backend-manifest.json"), "utf8"), /MinimalApp\.HomePageProps/);
    assert.match(readFileSync(path.join(app, "docs/ai/PROJECT.md"), "utf8"), /Product name: Minimal App/);
    assert.match(readFileSync(path.join(app, "README.md"), "utf8"), /^# Minimal App/m);

    writeFileSync(path.join(app, "app/application-owned.marker"), "keep\n");
    const dryUpgrade = spawnSync(process.execPath, [cli, "upgrade", "0.1.4", "--dry-run"],
      { cwd: app, encoding: "utf8" });
    assert.equal(dryUpgrade.status, 0, dryUpgrade.stderr);
    const generatedActions = readFileSync(path.join(app, "src/actions.ts"), "utf8");
    assert.doesNotMatch(generatedActions, /createServerAction/);
    assert.equal(JSON.parse(readFileSync(path.join(app, "package.json"), "utf8")).devDependencies["@rafagouveia/dotreact-cli"], "0.1.4");
    const upgrade = spawnSync(process.execPath, [cli, "upgrade", "0.1.4"],
      { cwd: app, encoding: "utf8", timeout: 30_000 });
    assert.equal(upgrade.status, 0, upgrade.stderr);
    assert.equal(existsSync(path.join(app, "app/application-owned.marker")), true);
    assert.equal(JSON.parse(readFileSync(path.join(app, "package.json"), "utf8")).devDependencies["@rafagouveia/dotreact-cli"], "0.1.4");
    assert.match(readFileSync(path.join(app, "Server/Server.csproj"), "utf8"), /DotReact\.Hosting" Version="0\.1\.4"/);
    assert.equal(JSON.parse(readFileSync(path.join(app, ".config/dotnet-tools.json"), "utf8")).tools["dotreact.typegen.tool"].version, "0.1.4");
    mkdirSync(path.join(app, "framework"));
    const ambiguousDoctor = spawnSync(process.execPath, [cli, "doctor"], { cwd: app, encoding: "utf8" });
    assert.equal(ambiguousDoctor.status, 1);
    assert.match(ambiguousDoctor.stderr, /Legacy framework\/ runtime/);
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
    assert.equal(existsSync(path.join(app, "app/_actions")), false);
    assert.equal(existsSync(path.join(app, "app/products")), false);
    assert.equal(existsSync(path.join(app, "app/streaming")), false);
    assert.match(readFileSync(path.join(app, "app/page.drx"), "utf8"), /minimal template/);
    assert.doesNotMatch(readFileSync(path.join(app, "src/contracts.ts"), "utf8"), /ProductPageProps/);
    const manifest = JSON.parse(readFileSync(path.join(app, "src/backend-manifest.json"), "utf8"));
    assert.equal(manifest.pages.length, 1);
    assert.equal(manifest.actions.length, 0);
    assert.deepEqual(discoverPageModules(path.join(app, "app")).sort(),
      manifest.pages.map((page: { moduleId: string }) => page.moduleId).sort());
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
