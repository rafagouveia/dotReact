#!/usr/bin/env node
import { access, cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { watch as watchFiles } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { addArtifact, type ScaffoldKind } from "./scaffolding.js";
import { analyzeBundles, formatReport } from "./performance.js";
import { benchmarkUrl, formatBenchmark } from "./benchmark.js";
import { parsePrerenderManifest, validateStaticRoutes } from "./static-export.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const [command = "help", ...args] = process.argv.slice(2);
const shouldCopy = (source: string): boolean => !/[\\/](\.git|node_modules|dist|bin|obj|\.dotreact|coverage|TestResults|\.playwright-cli)([\\/]|$)/.test(source);
// CLI executables must exist before `npm install` links package bins. Other
// vendored packages are rebuilt by the generated project's prepare script.
const shouldCopyExecutablePackage = (source: string): boolean => !/[\\/](\.git|node_modules|bin|obj|\.dotreact|coverage|TestResults|\.playwright-cli)([\\/]|$)/.test(source);
const workspaceInfrastructure = [
  ".github",
  ".vscode",
  "deploy",
  "docs",
  ".dockerignore",
  ".editorconfig",
  ".gitattributes",
  ".gitignore",
  ".npmrc",
  ".nvmrc",
  "Directory.Build.props",
  "Dockerfile",
  "global.json",
  "package-lock.json",
  "tsconfig.base.json",
  "tsconfig.json",
  "vite.config.ts",
  "src/dotreact.d.ts"
] as const;

function replaceRequired(source: string, search: string, replacement: string, label: string): string {
  const occurrences = source.split(search).length - 1;
  if (occurrences !== 1)
    throw new Error(`Scaffold template drift: expected exactly one ${label}, found ${occurrences}.`);
  return source.replace(search, replacement);
}

async function assertNoMonorepoPaths(target: string): Promise<void> {
  const leakedPath = /(?:\.\.[\\/])+(?:packages|dotnet)(?:[\\/]|$)/;
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name === "vendor") continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const content = await readFile(path, "utf8");
      if (leakedPath.test(content))
        throw new Error(`Generated project contains a monorepo-relative path in ${relative(target, path)}.`);
    }
  };
  await visit(target);
}

async function create(name: string | undefined, template: string | undefined): Promise<void> {
  if (!name || !/^[a-zA-Z][a-zA-Z0-9._-]*$/.test(name)) {
    throw new Error("Use: dotreact create <project-name> --template starter");
  }
  if (template !== undefined && template !== "starter" && template !== "minimal")
    throw new Error(`Unknown template '${template}'. Run dotreact templates.`);
  const target = resolve(process.cwd(), name);
  await mkdir(target, { recursive: false });
  try {
  await cp(resolve(repoRoot, "examples/starter"), target, { recursive: true, filter: shouldCopy });
  if (template === "minimal") await applyMinimalTemplate(target);
  await rename(resolve(target, "Dockerfile.scaffold"), resolve(target, "Dockerfile"));
  await cp(resolve(repoRoot, ".dockerignore"), resolve(target, ".dockerignore"));
  await cp(resolve(repoRoot, ".gitignore"), resolve(target, ".gitignore"));
  await cp(resolve(repoRoot, ".gitattributes"), resolve(target, ".gitattributes"));
  await cp(resolve(repoRoot, ".editorconfig"), resolve(target, ".editorconfig"));
  await cp(resolve(repoRoot, ".npmrc"), resolve(target, ".npmrc"));
  await cp(resolve(repoRoot, ".nvmrc"), resolve(target, ".nvmrc"));
  await cp(resolve(repoRoot, ".env.example"), resolve(target, ".env.example"));
  await cp(resolve(repoRoot, "global.json"), resolve(target, "global.json"));
  await cp(resolve(repoRoot, "deploy/azure"), resolve(target, "deploy/azure"), { recursive: true, filter: shouldCopy });
  await cp(resolve(repoRoot, "dotnet/Directory.Build.props"), resolve(target, "Directory.Build.props"));
  await cp(resolve(repoRoot, "dotnet/src/DotReact.AspNetCore"), resolve(target, "vendor/DotReact.AspNetCore"), { recursive: true, filter: shouldCopy });
  await cp(resolve(repoRoot, "dotnet/src/DotReact.AppGenerator"), resolve(target, "vendor/DotReact.AppGenerator"), { recursive: true, filter: shouldCopy });
  await cp(resolve(repoRoot, "dotnet/src/DotReact.Hosting"), resolve(target, "vendor/DotReact.Hosting"), { recursive: true, filter: shouldCopy });
  await cp(resolve(repoRoot, "dotnet/src/DotReact.Images.SkiaSharp"), resolve(target, "vendor/DotReact.Images.SkiaSharp"), { recursive: true, filter: shouldCopy });
  await cp(resolve(repoRoot, "dotnet/src/DotReact.Redis"), resolve(target, "vendor/DotReact.Redis"), { recursive: true, filter: shouldCopy });
  await cp(resolve(repoRoot, "dotnet/src/DotReact.TypeGen"), resolve(target, "vendor/DotReact.TypeGen"), { recursive: true, filter: shouldCopy });
  await cp(resolve(repoRoot, "dotnet/Directory.Build.props"), resolve(target, "vendor/Directory.Build.props"));
  await cp(resolve(repoRoot, "packages/protocol"), resolve(target, "vendor/protocol"), { recursive: true, filter: shouldCopy });
  await cp(resolve(repoRoot, "packages/renderer"), resolve(target, "vendor/renderer"), { recursive: true, filter: shouldCopy });
  await cp(resolve(repoRoot, "packages/client"), resolve(target, "vendor/client"), { recursive: true, filter: shouldCopy });
  await cp(resolve(repoRoot, "packages/image"), resolve(target, "vendor/image"), { recursive: true, filter: shouldCopy });
  await cp(resolve(repoRoot, "packages/font"), resolve(target, "vendor/font"), { recursive: true, filter: shouldCopy });
  await cp(resolve(repoRoot, "packages/script"), resolve(target, "vendor/script"), { recursive: true, filter: shouldCopy });
  await cp(resolve(repoRoot, "packages/adapter"), resolve(target, "vendor/adapter"), { recursive: true, filter: shouldCopy });
  await cp(resolve(repoRoot, "packages/vite"), resolve(target, "vendor/vite"), { recursive: true, filter: shouldCopyExecutablePackage });
  await cp(resolve(repoRoot, "packages/cli"), resolve(target, "vendor/cli"), { recursive: true, filter: shouldCopyExecutablePackage });
  await writeFile(resolve(target, "vendor/README.md"), `# Managed DotReact runtime\n\nThis directory is a pinned pre-release runtime snapshot. Application developers and coding agents must not edit it. Upgrade it only through a DotReact CLI upgrade command or by regenerating the project. It remains vendored until the npm and NuGet packages are published.\n`);
  await cp(resolve(repoRoot, "tsconfig.base.json"), resolve(target, "tsconfig.base.json"));
  const csprojPath = resolve(target, "Server/Server.csproj");
  const csproj = await readFile(csprojPath, "utf8");
  const rewrittenCsproj = replaceRequired(csproj,
    "../../../dotnet/src/DotReact.Hosting/DotReact.Hosting.csproj",
    "../vendor/DotReact.Hosting/DotReact.Hosting.csproj", "hosting project reference");
  const rewrittenProject = replaceRequired(rewrittenCsproj,
    "../../../dotnet/src/DotReact.AppGenerator/DotReact.AppGenerator.csproj",
    "../vendor/DotReact.AppGenerator/DotReact.AppGenerator.csproj", "app generator project reference");
  await writeFile(csprojPath, rewrittenProject);
  const packagePath = resolve(target, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    name: string;
  };
  packageJson.name = name.toLowerCase();
  packageJson.dependencies["@dotreact/protocol"] = "file:vendor/protocol";
  packageJson.dependencies["@dotreact/renderer"] = "file:vendor/renderer";
  packageJson.dependencies["@dotreact/client"] = "file:vendor/client";
  packageJson.dependencies["@dotreact/image"] = "file:vendor/image";
  packageJson.dependencies["@dotreact/font"] = "file:vendor/font";
  packageJson.dependencies["@dotreact/script"] = "file:vendor/script";
  packageJson.devDependencies["@dotreact/adapter"] = "file:vendor/adapter";
  packageJson.devDependencies["@dotreact/vite"] = "file:vendor/vite";
  packageJson.devDependencies["@dotreact/cli"] = "file:vendor/cli";
  const scripts = (packageJson as unknown as { scripts: Record<string, string> }).scripts;
  scripts["dotreact:runtime"] = "npm run build --prefix vendor/protocol && npm run build --prefix vendor/client && npm run build --prefix vendor/renderer && npm run build --prefix vendor/image && npm run build --prefix vendor/font && npm run build --prefix vendor/script && npm run build --prefix vendor/adapter && npm run build --prefix vendor/vite && npm run build --prefix vendor/cli";
  delete scripts["build:framework"];
  scripts.drx = "dotreact";
  scripts.prepare = "npm run dotreact:runtime";
  scripts["dev:renderer"] = replaceRequired(scripts["dev:renderer"] ?? "", "../../packages/renderer/dist/server.js",
    "vendor/renderer/dist/server.js", "renderer development path");
  scripts.generate = replaceRequired(scripts.generate ?? "", "../../dotnet/src/DotReact.TypeGen/DotReact.TypeGen.csproj",
    "vendor/DotReact.TypeGen/DotReact.TypeGen.csproj", "contract generator path");
  scripts["check:contracts"] = replaceRequired(scripts["check:contracts"] ?? "", "../../dotnet/src/DotReact.TypeGen/DotReact.TypeGen.csproj",
    "vendor/DotReact.TypeGen/DotReact.TypeGen.csproj", "contract checker path");
  scripts.build = `npm run dotreact:runtime && ${scripts.build ?? ""}`;
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  const appTsconfigPath = resolve(target, "tsconfig.json");
  const appTsconfig = await readFile(appTsconfigPath, "utf8");
  await writeFile(appTsconfigPath, replaceRequired(appTsconfig, "../../tsconfig.base.json", "./tsconfig.base.json",
    "TypeScript base configuration path"));
  await assertNoMonorepoPaths(target);
  process.stdout.write(`Created ${name}.\nNext: cd ${name} && npm install && npm run dev\n`);
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
}

async function applyMinimalTemplate(target: string): Promise<void> {
  for (const path of [
    "Server/Actions",
    "app/products",
    "app/streaming"
  ]) await rm(resolve(target, path), { recursive: true, force: true });
  await writeFile(resolve(target, "app/page.drx"), `import type { HomePageProps } from "../src/contracts";\nimport type { DotReactMetadata } from "@dotreact/vite";\n\nexport const metadata: DotReactMetadata = {\n  title: "DotReact minimal",\n  description: "ASP.NET Core, React SSR and hydration."\n};\n\nexport default function HomePage({ message, generatedAt }: HomePageProps) {\n  return (\n    <main className="shell">\n      <p className="eyebrow">ASP.NET Core + React SSR + DRX</p>\n      <h1>{message}</h1>\n      <p>This minimal template is ready for your first page.</p>\n      <p className="muted">Generated at {generatedAt}</p>\n    </main>\n  );\n}\n`);
  await writeFile(resolve(target, "src/contracts.ts"), `// <auto-generated by DotReact.TypeGen />\n\nexport interface HomePageProps {\n  generatedAt: string;\n  message: string;\n}\n`);
  await writeFile(resolve(target, "src/actions.ts"), `// <auto-generated by DotReact.TypeGen />\n\nimport { createServerAction } from "@dotreact/client";\n`);
  await writeFile(resolve(target, "src/backend-manifest.json"), `${JSON.stringify({
    schemaVersion: 2,
    pages: [{
      moduleId: "page",
      pattern: "/",
      routing: "app",
      propsType: "DotReact.Starter.HomePageProps"
    }],
    actions: []
  }, null, 2)}\n`);
  await writeFile(resolve(target, "README.md"), `# DotReact minimal project\n\nASP.NET Core owns HTTP and data; React renders on the server and hydrates in the browser.\n\nThe scaffold is repository-ready but deliberately does not run \`git init\`. Run \`npm install\` and commit the resulting \`package-lock.json\` before relying on the included CI workflow. Repository defaults cover Git, editors, Node/npm, .NET and Docker.\n\n\`\`\`powershell\nnpm install\nnpm exec -- dotreact doctor\nnpm exec -- dotreact dev\n\`\`\`\n\nGenerate application artifacts without overwriting existing files:\n\n\`\`\`powershell\nnpm exec -- dotreact generate page catalog/[slug]\nnpm exec -- dotreact generate layout catalog\nnpm exec -- dotreact generate action SaveCatalog\nnpm exec -- dotreact sync\nnpm exec -- dotreact check\n\`\`\`\n\nUse \`npm exec -- dotreact build\`, \`npm exec -- dotreact analyze\` and \`npm exec -- dotreact start\` for the production lifecycle. Set \`OTEL_EXPORTER_OTLP_ENDPOINT\` to export DotReact traces and metrics through OTLP.\n`);
}

function run(executable: string, commandArgs: string[], cwd = process.cwd(), env?: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const windowsCommand = process.platform === "win32" && executable.toLowerCase().endsWith(".cmd");
    const program = windowsCommand ? process.env.ComSpec ?? "cmd.exe" : executable;
    const args = windowsCommand ? ["/d", "/s", "/c", executable, ...commandArgs] : commandArgs;
    const child = spawn(program, args, { cwd, stdio: "inherit", shell: false, ...(env === undefined ? {} : { env }) });
    child.once("exit", code => code === 0 ? resolvePromise() : reject(new Error(`${executable} exited with code ${code ?? "unknown"}.`)));
  });
}

const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const dotnetExecutable = process.platform === "win32" ? "dotnet.exe" : "dotnet";

async function requireProject(): Promise<string> {
  const root = process.cwd();
  for (const file of ["package.json", "Server/Server.csproj", "vite.config.ts", "app"]) {
    try { await access(resolve(root, file)); }
    catch { throw new Error(`Current directory is not a DotReact project (missing ${file}).`); }
  }
  return root;
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; }
  catch { return false; }
}

async function runProjectScript(script: string): Promise<void> {
  await run(npmExecutable, ["run", script], await requireProject());
}

function isContractSource(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  if (normalized.split("/").some(segment => segment === "bin" || segment === "obj")) return false;
  return /\.(?:cs|csproj|props|targets)$/iu.test(normalized);
}

async function sync(values: string[]): Promise<void> {
  if (!values.includes("--watch")) {
    if (values.length > 0) throw new Error("Use: dotreact sync [--watch]");
    await runProjectScript("generate");
    return;
  }
  if (values.some(value => value !== "--watch")) throw new Error("Use: dotreact sync [--watch]");

  const root = await requireProject();
  const watchRoots = [resolve(root, "Server"), resolve(root, "app")];
  await Promise.all(watchRoots.map(path => access(path)));
  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let pending = false;
  let closed = false;

  const synchronize = async (): Promise<void> => {
    if (running) {
      pending = true;
      return;
    }
    running = true;
    do {
      pending = false;
      try {
        process.stdout.write("[dotreact] C# contract change detected; regenerating TypeScript artifacts.\n");
        await runProjectScript("generate");
      } catch (error) {
        process.stderr.write(`[dotreact] Contract regeneration failed: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    } while (pending && !closed);
    running = false;
  };

  const watchers = watchRoots.map(watchRoot => watchFiles(watchRoot, { recursive: true, encoding: "utf8" }, (_event, filename) => {
    if (closed || filename === null || !isContractSource(filename)) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => { void synchronize(); }, 200);
  }));
  process.stdout.write("[dotreact] Watching Server/ and app/ C# sources for contract changes.\n");
  await new Promise<void>(resolvePromise => {
    const close = (): void => {
      if (closed) return;
      closed = true;
      if (timer !== undefined) clearTimeout(timer);
      watchers.forEach(watcher => watcher.close());
      resolvePromise();
    };
    watchers.forEach(watcher => watcher.once("error", error => {
      process.stderr.write(`[dotreact] Contract watcher failed: ${error.message}\n`);
      close();
    }));
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
  });
}

async function check(): Promise<void> {
  await requireProject();
  await runProjectScript("check:contracts");
  await runProjectScript("typecheck");
}

async function start(): Promise<void> {
  const root = await requireProject();
  await runProjectScript("build");
  const outputRoot = resolve(root, ".dotreact");
  const publishRoot = resolve(outputRoot, "publish");
  if (!publishRoot.startsWith(`${outputRoot}${process.platform === "win32" ? "\\" : "/"}`))
    throw new Error("Refusing to publish outside the project .dotreact directory.");
  await rm(publishRoot, { recursive: true, force: true });
  await mkdir(publishRoot, { recursive: true });
  await run(dotnetExecutable, ["publish", "Server/Server.csproj", "-c", "Release", "-o", publishRoot, "/p:UseAppHost=false"], root);
  await cp(resolve(root, "dist/client"), resolve(publishRoot, "wwwroot"), { recursive: true });
  await cp(resolve(root, "dist/server"), resolve(publishRoot, "frontend/server"), { recursive: true });

  const rendererCandidates = [
    resolve(root, "vendor/renderer/dist"),
    resolve(root, "node_modules/@dotreact/renderer/dist"),
    resolve(root, "../../packages/renderer/dist")
  ];
  let renderer: string | undefined;
  for (const candidate of rendererCandidates) {
    try { await access(resolve(candidate, "production-server.js")); renderer = candidate; break; }
    catch { /* try the next supported layout */ }
  }
  if (renderer === undefined) throw new Error("Compiled DotReact production renderer was not found. Run npm install and build again.");
  await cp(renderer, resolve(publishRoot, "renderer"), { recursive: true });

  const startEnvironment = {
    ...process.env,
    ASPNETCORE_ENVIRONMENT: "Production",
    DOTREACT_CLIENT_SCRIPT_SRC: "/_dotreact/client.js"
  };
  await run(dotnetExecutable, ["Server.dll"], publishRoot, startEnvironment);
}

async function doctor(): Promise<void> {
  await run(process.execPath, ["--version"]);
  await run(dotnetExecutable, ["--version"]);
  const root = await requireProject();
  const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as { scripts?: Record<string, string> };
  for (const script of ["dev", "build", "typecheck", "check:contracts"]) {
    if (!packageJson.scripts?.[script]) throw new Error(`Required npm script is missing: ${script}`);
  }
  const vendorRuntime = await exists(resolve(root, "vendor"));
  const legacyRuntime = await exists(resolve(root, "framework"));
  if (vendorRuntime && legacyRuntime)
    throw new Error("Both vendor/ and legacy framework/ runtimes exist. Keep only the pinned vendor/ runtime.");
  if (legacyRuntime)
    throw new Error("Legacy framework/ runtime detected. Upgrade the scaffold to the managed vendor/ layout.");
  if (vendorRuntime) {
    for (const file of [
      "vendor/README.md",
      "vendor/DotReact.AspNetCore/DotReact.AspNetCore.csproj",
      "vendor/DotReact.AppGenerator/DotReact.AppGenerator.csproj",
      "vendor/DotReact.Hosting/DotReact.Hosting.csproj",
      "vendor/renderer/package.json",
      "vendor/client/package.json",
      "vendor/font/package.json",
      "vendor/script/package.json"
    ]) if (!await exists(resolve(root, file))) throw new Error(`Managed runtime is incomplete: ${file}`);
  }
  for (const file of ["src/contracts.ts", "src/actions.ts", "src/backend-manifest.json"]) {
    if (!await exists(resolve(root, file))) throw new Error(`Generated boundary artifact is missing: ${file}`);
  }
  process.stdout.write(`[dotreact] Project zones: routes=app/; backend=Server/; React support=src/; generated=src/contracts.ts,src/actions.ts,src/backend-manifest.json; runtime=${vendorRuntime ? "vendor/" : "packages"}.\n`);
  process.stdout.write("DotReact doctor: runtimes, project structure and scripts are ready.\n");
}

async function workspace(values: string[]): Promise<void> {
  const mode = values[0] ?? "status";
  if (!["focus", "reveal", "status"].includes(mode) || values.length > 1)
    throw new Error("Use: dotreact workspace <focus|reveal|status>.");
  const root = await requireProject();
  const settingsPath = resolve(root, ".vscode/settings.json");
  const settings = JSON.parse(await readFile(settingsPath, "utf8")) as {
    "files.exclude"?: Record<string, boolean>;
    "search.exclude"?: Record<string, boolean>;
  };
  const files = settings["files.exclude"] ??= {};
  const search = settings["search.exclude"] ??= {};
  const focused = workspaceInfrastructure.every(path => files[path] === true);
  if (mode === "status") {
    process.stdout.write(`DotReact workspace: ${focused ? "focus" : "reveal"}.\n`);
    return;
  }
  for (const path of workspaceInfrastructure) {
    if (mode === "focus") {
      files[path] = true;
      search[path] = true;
    } else {
      delete files[path];
      delete search[path];
    }
  }
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  process.stdout.write(mode === "focus"
    ? "DotReact workspace focused: application and extension points are visible; managed infrastructure is hidden.\n"
    : "DotReact workspace revealed: advanced configuration and deployment files are visible.\n");
}

function optionValue(values: string[], name: string): string | undefined {
  const index = values.indexOf(name);
  if (index === -1) return undefined;
  const value = values[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return value;
}

async function generate(values: string[]): Promise<void> {
  const root = await requireProject();
  const kind = values[0] as ScaffoldKind | undefined;
  if (!kind || !["page", "layout", "action", "boundary"].includes(kind))
    throw new Error("Use: dotreact generate <page|layout|action|boundary> <name>.");
  const name = values[1];
  const boundaryValue = optionValue(values, "--kind");
  if (boundaryValue !== undefined && boundaryValue !== "error" && boundaryValue !== "not-found"
    && boundaryValue !== "loading" && boundaryValue !== "global-error")
    throw new Error("--kind must be error, not-found, loading or global-error.");
  const boundary: "error" | "not-found" | "loading" | "global-error" | undefined = boundaryValue;
  const dryRun = values.includes("--dry-run");
  const options = {
    ...(boundary === undefined ? {} : { boundaryKind: boundary }),
    ...(dryRun ? { dryRun: true } : {})
  };
  const paths = await addArtifact(root, kind, name, options);
  process.stdout.write(`${dryRun ? "Would generate" : "Generated"} ${kind}:\n${paths.map(path => `  ${path}`).join("\n")}\n${dryRun ? "No files were written." : "Next: dotreact sync && dotreact check"}\n`);
}

function positiveNumberOption(values: string[], name: string, fallback: number): number {
  const raw = optionValue(values, name);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number.`);
  return value;
}

function integerOption(values: string[], name: string, fallback: number): number {
  const value = positiveNumberOption(values, name, fallback);
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be an integer.`);
  return value;
}

async function analyze(values: string[]): Promise<void> {
  const root = await requireProject();
  const report = await analyzeBundles(root, {
    clientKb: positiveNumberOption(values, "--max-client-kb", 100),
    ssrKb: positiveNumberOption(values, "--max-ssr-kb", 50),
    initialClientKb: positiveNumberOption(values, "--max-initial-client-kb", 75),
    asyncChunkKb: positiveNumberOption(values, "--max-async-chunk-kb", 30),
    cssKb: positiveNumberOption(values, "--max-css-kb", 40)
  });
  process.stdout.write(`${formatReport(report)}\nBundle budgets passed.\n`);
}

async function benchmark(values: string[]): Promise<void> {
  await requireProject();
  const url = values.find(value => !value.startsWith("--") && !/^\d+$/.test(value)) ?? "http://127.0.0.1:5080/";
  const result = await benchmarkUrl({
    url,
    requests: integerOption(values, "--requests", 100),
    concurrency: integerOption(values, "--concurrency", 8),
    warmup: Number(optionValue(values, "--warmup") ?? "5"),
    timeoutMs: integerOption(values, "--timeout-ms", 10_000)
  });
  process.stdout.write(`${formatBenchmark(result)}\n`);
  if (result.failures > 0) throw new Error(`Benchmark completed with ${result.failures} failed request(s).`);
}

async function exportStatic(values: string[]): Promise<void> {
  const root = await requireProject();
  const base = new URL(optionValue(values, "--url") ?? "http://127.0.0.1:5080/");
  if (!["http:", "https:"].includes(base.protocol) || base.username !== "" || base.password !== "")
    throw new Error("--url must be an HTTP(S) origin without credentials.");
  const configuredRoutes = optionValue(values, "--routes");
  let routes: string[];
  if (configuredRoutes !== undefined) {
    routes = validateStaticRoutes(configuredRoutes.split(","));
  } else {
    const response = await fetch(new URL("/_dotreact/prerender-manifest", base), {
      redirect: "error",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`Prerender manifest failed with HTTP ${response.status}.`);
    const manifest = parsePrerenderManifest(await response.json());
    routes = validateStaticRoutes(manifest.routes.map(route => route.path));
  }
  const outputRoot = resolve(root, optionValue(values, "--out") ?? "dist/static");
  await mkdir(outputRoot, { recursive: true });
  const manifest: Array<{ route: string; file: string; etag?: string; resolution?: string }> = [];
  for (const route of routes) {
    const segments = route.split("/").filter(Boolean).map(segment => {
      const decoded = decodeURIComponent(segment);
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(decoded) || decoded === "." || decoded === "..")
        throw new Error(`Route '${route}' cannot be mapped to a portable static file.`);
      return decoded;
    });
    const file = resolve(outputRoot, ...segments, "index.html");
    if (file !== resolve(outputRoot, "index.html") && !file.startsWith(`${outputRoot}${process.platform === "win32" ? "\\" : "/"}`))
      throw new Error(`Refusing to export route '${route}' outside the static output directory.`);
    const response = await fetch(new URL(route, base), { redirect: "error", headers: { Accept: "text/html" } });
    const mediaType = (response.headers.get("content-type") ?? "").split(";", 1)[0]?.trim().toLowerCase();
    if (!response.ok || mediaType !== "text/html")
      throw new Error(`Static export of '${route}' failed with HTTP ${response.status}.`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, await response.text(), "utf8");
    manifest.push({
      route,
      file: file.slice(outputRoot.length + 1).replaceAll("\\", "/"),
      ...(response.headers.get("etag") === null ? {} : { etag: response.headers.get("etag")! }),
      ...(response.headers.get("x-dotreact-prerender") === null
        ? {} : { resolution: response.headers.get("x-dotreact-prerender")! })
    });
  }
  await writeFile(resolve(outputRoot, "dotreact-static-manifest.json"), `${JSON.stringify({ routes: manifest }, null, 2)}\n`);
  process.stdout.write(`Exported ${manifest.length} static route(s) to ${outputRoot}.\n`);
}

function help(): void {
  process.stdout.write([
    "DotReact CLI",
    "  dotreact create <name> [--template starter|minimal]",
    "  dotreact templates",
    "  dotreact generate page <route> [--dry-run]",
    "  dotreact generate layout <route>",
    "  dotreact generate boundary <route> --kind <error|not-found|loading|global-error>",
    "  dotreact generate action <PascalCaseName>",
    "  dotreact add ...                         Alias for generate",
    "  dotreact sync [--watch]                  Regenerate C# to TypeScript artifacts",
    "  dotreact dev",
    "  dotreact build",
    "  dotreact analyze [--max-client-kb 100] [--max-initial-client-kb 75] [--max-async-chunk-kb 30] [--max-css-kb 40] [--max-ssr-kb 50]",
    "  dotreact benchmark [url] [--requests 100] [--concurrency 8]",
    "  dotreact export [--routes /,/products/1] [--url http://127.0.0.1:5080] [--out dist/static]",
    "  dotreact check",
    "  dotreact start",
    "  dotreact doctor",
    "  dotreact workspace <focus|reveal|status>  Control advanced infrastructure visibility"
  ].join("\n") + "\n");
}

try {
  if (command === "create") await create(args[0], optionValue(args, "--template"));
  else if (command === "templates") process.stdout.write("Available templates:\n  starter  SSR, hydration, actions, Docker and Azure health checks\n  minimal  One SSR page, hydration, boundaries and production runtime\n");
  else if (command === "generate" || command === "add") await generate(args);
  else if (command === "sync") await sync(args);
  else if (command === "dev") await runProjectScript("dev");
  else if (command === "build") await runProjectScript("build");
  else if (command === "analyze") await analyze(args);
  else if (command === "benchmark") await benchmark(args);
  else if (command === "export") await exportStatic(args);
  else if (command === "check") await check();
  else if (command === "start") await start();
  else if (command === "doctor") await doctor();
  else if (command === "workspace") await workspace(args);
  else help();
} catch (error) {
  process.stderr.write(`[dotreact] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
