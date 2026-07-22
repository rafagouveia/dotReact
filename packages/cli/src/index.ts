#!/usr/bin/env node
import { access, cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { watch as watchFiles } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { addArtifact, type ScaffoldKind } from "./scaffolding.js";
import { analyzeBundles, formatReport } from "./performance.js";
import {
  benchmarkUrl,
  compareBenchmarkResults,
  evaluateBenchmarkThresholds,
  formatBenchmark,
  formatBenchmarkComparison,
  type BenchmarkThresholds
} from "./benchmark.js";
import { parsePrerenderManifest, validateStaticRoutes } from "./static-export.js";
import { formatArchitectureReport, validateProjectArchitecture } from "./architecture.js";
import { formatSecurityReport, scanProjectSecurity } from "./security.js";
import { formatRouteDiagnostics, inspectRoutes } from "./routes.js";

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
  ".config",
  "Directory.Build.props",
  "Dockerfile",
  "global.json",
  "NuGet.config",
  "package-lock.json",
  "tsconfig.base.json",
  "tsconfig.json",
  "vite.config.ts",
  "lighthouserc.cjs",
  "scripts/lighthouse-audit.mjs",
  "src/dotreact.d.ts"
] as const;

interface ProjectIdentity {
  readonly packageName: string;
  readonly namespace: string;
  readonly displayName: string;
}

interface EmbeddedTemplate {
  readonly schemaVersion: number;
  readonly entries: ReadonlyArray<{ readonly path: string; readonly content: string }>;
}

async function frameworkVersion(): Promise<string> {
  const packageJson = JSON.parse(await readFile(resolve(here, "../package.json"), "utf8")) as { version?: string };
  if (!packageJson.version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(packageJson.version))
    throw new Error("The installed DotReact CLI package has no valid framework version.");
  return packageJson.version;
}

async function writeEmbeddedTemplate(target: string): Promise<void> {
  const template = JSON.parse(await readFile(resolve(here, "template.json"), "utf8")) as EmbeddedTemplate;
  if (template.schemaVersion !== 1 || !Array.isArray(template.entries) || template.entries.length === 0)
    throw new Error("The installed DotReact CLI package does not contain a valid project template. Reinstall it.");
  for (const entry of template.entries) {
    if (!entry.path || isAbsolute(entry.path)) throw new Error("The embedded project template contains an unsafe path.");
    const destination = resolve(target, entry.path);
    const localPath = relative(target, destination);
    if (localPath.startsWith("..") || isAbsolute(localPath))
      throw new Error("The embedded project template attempted to write outside the project directory.");
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, Buffer.from(entry.content, "base64"));
  }
}

function createProjectIdentity(name: string): ProjectIdentity {
  const words = name.split(/[^A-Za-z0-9]+/u).filter(Boolean);
  if (words.length === 0) throw new Error("Project name must contain a letter.");
  const namespace = words.map(word => `${word[0]!.toUpperCase()}${word.slice(1)}`).join("");
  const displayName = words.map(word => `${word[0]!.toUpperCase()}${word.slice(1)}`).join(" ");
  return { packageName: name.toLowerCase(), namespace, displayName };
}

async function copyRuntime(sourceRoot: string, targetVendor: string): Promise<void> {
  const mappings = [
    ["dotnet/src/DotReact.AspNetCore", "DotReact.AspNetCore", shouldCopy],
    ["dotnet/src/DotReact.AppGenerator", "DotReact.AppGenerator", shouldCopy],
    ["dotnet/src/DotReact.Hosting", "DotReact.Hosting", shouldCopy],
    ["dotnet/src/DotReact.Images.SkiaSharp", "DotReact.Images.SkiaSharp", shouldCopy],
    ["dotnet/src/DotReact.Redis", "DotReact.Redis", shouldCopy],
    ["dotnet/src/DotReact.TypeGen", "DotReact.TypeGen", shouldCopy],
    ["packages/protocol", "protocol", shouldCopy],
    ["packages/renderer", "renderer", shouldCopy],
    ["packages/client", "client", shouldCopy],
    ["packages/image", "image", shouldCopy],
    ["packages/font", "font", shouldCopy],
    ["packages/script", "script", shouldCopy],
    ["packages/adapter", "adapter", shouldCopy],
    ["packages/vite", "vite", shouldCopyExecutablePackage],
    ["packages/cli", "cli", shouldCopyExecutablePackage]
  ] as const;
  await mkdir(targetVendor, { recursive: true });
  for (const [source, target, filter] of mappings) {
    const sourcePath = resolve(sourceRoot, source);
    if (!await exists(sourcePath)) throw new Error(`Framework runtime source is incomplete: ${source}.`);
    await cp(sourcePath, resolve(targetVendor, target), { recursive: true, filter });
  }
  await cp(resolve(sourceRoot, "dotnet/Directory.Build.props"), resolve(targetVendor, "Directory.Build.props"));
  const frameworkPackage = JSON.parse(await readFile(resolve(sourceRoot, "package.json"), "utf8")) as { version?: string };
  await writeFile(resolve(targetVendor, "README.md"), `# Managed DotReact runtime\n\nThis directory is a pinned pre-release runtime snapshot. Application developers and coding agents must not edit it. Upgrade it only through \`dotreact upgrade --from <framework-root>\` or by regenerating the project. It remains vendored until the npm and NuGet packages are published.\n`);
  await writeFile(resolve(targetVendor, "dotreact-runtime.json"), `${JSON.stringify({
    schemaVersion: 1,
    frameworkVersion: frameworkPackage.version ?? "0.0.0-preview",
    channel: "private-preview"
  }, null, 2)}\n`);
}

async function clearDirectoryContents(directory: string): Promise<void> {
  for (const entry of await readdir(directory))
    await rm(resolve(directory, entry), { recursive: true, force: true });
}

async function applyProjectIdentity(target: string, identity: ProjectIdentity): Promise<void> {
  const textExtensions = new Set([".cs", ".drx", ".json"]);
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && textExtensions.has(entry.name.slice(entry.name.lastIndexOf(".")))) {
        const original = await readFile(path, "utf8");
        const updated = original
          .replaceAll("DotReact.Starter", identity.namespace)
          .replaceAll("DotReact minimal", `${identity.displayName} · DotReact`)
          .replaceAll("DotReact · C# + React SSR", `${identity.displayName} · DotReact`)
          .replaceAll("Seu primeiro app DotReact com page.drx", `${identity.displayName} executando com DotReact`);
        if (updated !== original) await writeFile(path, updated);
      }
    }
  };
  await visit(resolve(target, "app"));
  await visit(resolve(target, "Server"));
  await visit(resolve(target, "src"));

  const csprojPath = resolve(target, "Server/Server.csproj");
  let csproj = await readFile(csprojPath, "utf8");
  csproj = replaceRequired(csproj, "    <ImplicitUsings>enable</ImplicitUsings>",
    `    <ImplicitUsings>enable</ImplicitUsings>\n    <RootNamespace>${identity.namespace}.Server</RootNamespace>\n    <AssemblyName>${identity.namespace}.Server</AssemblyName>`,
    "project namespace anchor");
  await writeFile(csprojPath, csproj);

  const readmePath = resolve(target, "README.md");
  const readme = await readFile(readmePath, "utf8");
  await writeFile(readmePath, readme.replace(/^# [^\r\n]+/u, `# ${identity.displayName}`));
  const profilePath = resolve(target, "docs/ai/PROJECT.md");
  const profile = await readFile(profilePath, "utf8");
  await writeFile(profilePath, profile.replace("- Product name: replace with the real product name.",
    `- Product name: ${identity.displayName}.`));
  const packagePath = resolve(target, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as { scripts?: Record<string, string> };
  for (const script of ["generate", "check:contracts"]) {
    const value = packageJson.scripts?.[script];
    if (value !== undefined) packageJson.scripts![script] = value.replaceAll("Server.dll", `${identity.namespace}.Server.dll`);
  }
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  const dockerfilePath = resolve(target, "Dockerfile");
  const dockerfile = await readFile(dockerfilePath, "utf8");
  await writeFile(dockerfilePath, dockerfile.replaceAll("Server.dll", `${identity.namespace}.Server.dll`));
}

function replaceRequired(source: string, search: string, replacement: string, label: string): string {
  const occurrences = source.split(search).length - 1;
  if (occurrences !== 1)
    throw new Error(`Scaffold template drift: expected exactly one ${label}, found ${occurrences}.`);
  return source.replace(search, replacement);
}

function replacePatternRequired(source: string, pattern: RegExp, replacement: string, label: string): string {
  const occurrences = [...source.matchAll(pattern)].length;
  if (occurrences !== 1)
    throw new Error(`Scaffold template drift: expected exactly one ${label}, found ${occurrences}.`);
  return source.replace(pattern, replacement);
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
  const identity = createProjectIdentity(name);
  const target = resolve(process.cwd(), name);
  await mkdir(target, { recursive: false });
  try {
  await writeEmbeddedTemplate(target);
  if (template === "minimal") await applyMinimalTemplate(target);
  await rename(resolve(target, "Dockerfile.scaffold"), resolve(target, "Dockerfile"));
  const version = await frameworkVersion();
  const csprojPath = resolve(target, "Server/Server.csproj");
  const csproj = await readFile(csprojPath, "utf8");
  const rewrittenCsproj = replaceRequired(csproj,
    "    <ProjectReference Include=\"../../../dotnet/src/DotReact.Hosting/DotReact.Hosting.csproj\" />",
    `    <PackageReference Include=\"DotReact.Hosting\" Version=\"${version}\" />`, "hosting project reference");
  const rewrittenProject = replacePatternRequired(rewrittenCsproj,
    /    <ProjectReference Include="\.\.\/\.\.\/\.\.\/dotnet\/src\/DotReact\.AppGenerator\/DotReact\.AppGenerator\.csproj"\s+OutputItemType="Analyzer"\s+ReferenceOutputAssembly="false" \/>/gu,
    `    <PackageReference Include="DotReact.AppGenerator" Version="${version}"\n                      OutputItemType="Analyzer"\n                      ReferenceOutputAssembly="false"\n                      PrivateAssets="all" />`, "app generator project reference");
  await writeFile(csprojPath, rewrittenProject);
  const packagePath = resolve(target, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    license?: string;
    name: string;
  };
  packageJson.name = identity.packageName;
  packageJson.license = "UNLICENSED";
  for (const dependency of Object.keys(packageJson.dependencies)) {
    if (dependency.startsWith("@rafagouveia/dotreact-")) packageJson.dependencies[dependency] = version;
  }
  for (const dependency of Object.keys(packageJson.devDependencies)) {
    if (dependency.startsWith("@rafagouveia/dotreact-")) packageJson.devDependencies[dependency] = version;
  }
  const scripts = (packageJson as unknown as { scripts: Record<string, string> }).scripts;
  scripts.postinstall = "dotnet tool restore";
  delete scripts["build:framework"];
  delete scripts["dotreact:runtime"];
  delete scripts.prepare;
  scripts.drx = "dotreact";
  scripts["dev:renderer"] = replaceRequired(scripts["dev:renderer"] ?? "", "../../packages/renderer/dist/server.js",
    "node_modules/@rafagouveia/dotreact-renderer/dist/server.js", "renderer development path");
  scripts.generate = replaceRequired(scripts.generate ?? "",
    "dotnet run --project ../../dotnet/src/DotReact.TypeGen/DotReact.TypeGen.csproj --",
    "dotnet tool run dotreact-typegen --", "contract generator path");
  scripts["check:contracts"] = replaceRequired(scripts["check:contracts"] ?? "",
    "dotnet run --project ../../dotnet/src/DotReact.TypeGen/DotReact.TypeGen.csproj --",
    "dotnet tool run dotreact-typegen --", "contract checker path");
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  await mkdir(resolve(target, ".config"), { recursive: true });
  await writeFile(resolve(target, ".config/dotnet-tools.json"), `${JSON.stringify({
    version: 1,
    isRoot: true,
    tools: { "dotreact.typegen.tool": { version, commands: ["dotreact-typegen"] } }
  }, null, 2)}\n`);
  const appTsconfigPath = resolve(target, "tsconfig.json");
  const appTsconfig = await readFile(appTsconfigPath, "utf8");
  await writeFile(appTsconfigPath, replaceRequired(appTsconfig, "../../tsconfig.base.json", "./tsconfig.base.json",
    "TypeScript base configuration path"));
  await applyProjectIdentity(target, identity);
  await assertNoMonorepoPaths(target);
  process.stdout.write(`Created ${name}.\nNext: cd ${name} && npm install && npm run dev\n`);
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
}

async function applyMinimalTemplate(target: string): Promise<void> {
  for (const path of [
    "app/_actions",
    "app/benchmark",
    "app/benchmark-interactive",
    "app/products",
    "app/streaming"
  ]) await rm(resolve(target, path), { recursive: true, force: true });
  await writeFile(resolve(target, "app/page.drx"), `import type { HomePageProps } from "../src/contracts";\nimport type { DotReactMetadata } from "@rafagouveia/dotreact-vite";\n\nexport const metadata: DotReactMetadata = {\n  title: "DotReact minimal",\n  description: "ASP.NET Core, React SSR and hydration."\n};\n\nexport default function HomePage({ message, generatedAt }: HomePageProps) {\n  return (\n    <main className="shell">\n      <p className="eyebrow">ASP.NET Core + React SSR + DRX</p>\n      <h1>{message}</h1>\n      <p>This minimal template is ready for your first page.</p>\n      <p className="muted">Generated at {generatedAt}</p>\n    </main>\n  );\n}\n`);
  await writeFile(resolve(target, "src/contracts.ts"), `// <auto-generated by DotReact.TypeGen />\n\nexport interface HomePageProps {\n  generatedAt: string;\n  message: string;\n}\n`);
  await writeFile(resolve(target, "src/actions.ts"), `// <auto-generated by DotReact.TypeGen />\n`);
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
  await writeFile(resolve(target, "README.md"), `# DotReact minimal project\n\nASP.NET Core owns HTTP, security and data; React renders on the server and hydrates in the browser. Keep routes, route-private components and Server Actions in \`app/\`; keep Domain, Application, Infrastructure and jobs in \`Server/\`; keep public assets in \`public/\`. Framework runtime dependencies are pinned npm and NuGet packages; do not copy framework source into the application.\n\nThe scaffold is repository-ready but deliberately does not run \`git init\`. Authenticate npm and NuGet for the private GitHub Packages feeds, run \`npm install\`, and commit the resulting \`package-lock.json\` before relying on the included CI workflow. Repository defaults cover Git, editors, Node/npm, .NET, Docker and dependency updates. Install the global launcher once; it delegates commands to this project's pinned local CLI.\n\n\`\`\`powershell\nnpm install\ndotreact doctor\ndotreact dev\n\`\`\`\n\nGenerate application artifacts without overwriting existing files:\n\n\`\`\`powershell\ndotreact generate page catalog/[slug]\ndotreact generate layout catalog\ndotreact generate component CatalogCard --route catalog\ndotreact generate action SaveCatalog --route catalog\ndotreact sync\ndotreact check\n\`\`\`\n\nUse \`dotreact build\`, \`dotreact analyze\` and \`dotreact start\` for the production lifecycle. Run \`npm run verify\` before integration. Set \`OTEL_EXPORTER_OTLP_ENDPOINT\` to export DotReact traces and metrics through OTLP. Update the pinned DotReact package versions together and validate with \`npm run verify\`.\n`);
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

async function projectScripts(root: string): Promise<Record<string, string>> {
  const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };
  return packageJson.scripts ?? {};
}

async function buildProject(): Promise<void> {
  const root = await requireProject();
  await assertArchitecture(root);
  const scripts = await projectScripts(root);
  const managedRuntimeOutputs = [
    "vendor/protocol/dist/index.js",
    "vendor/client/dist/index.js",
    "vendor/renderer/dist/server.js",
    "vendor/vite/dist/index.js",
    "vendor/cli/dist/index.js"
  ];
  if (scripts["dotreact:runtime"] !== undefined
    && !(await Promise.all(managedRuntimeOutputs.map(path => exists(resolve(root, path))))).every(Boolean))
    await run(npmExecutable, ["run", "dotreact:runtime"], root);
  for (const script of ["generate", "build:client", "build:ssr"]) {
    if (scripts[script] === undefined)
      throw new Error(`Framework build prerequisite is missing: npm script '${script}'.`);
    await run(npmExecutable, ["run", script], root);
  }
  await run(dotnetExecutable, ["build", "Server/Server.csproj", "-c", "Release"], root);
  process.stdout.write("DotReact build: contracts, client, SSR and ASP.NET Core completed.\n");
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
  const root = await requireProject();
  await assertArchitecture(root);
  await runProjectScript("check:contracts");
  await runProjectScript("typecheck");
}

async function security(values: string[]): Promise<void> {
  if (values.some(value => value !== "--static-only"))
    throw new Error("Use: dotreact security [--static-only].");
  const root = await requireProject();
  const report = await scanProjectSecurity(root);
  process.stdout.write(`${formatSecurityReport(report)}\n`);
  if (report.findings.some(finding => finding.severity === "high"))
    throw new Error("High-severity application source findings must be fixed before release.");
  if (values.includes("--static-only")) return;
  await run(npmExecutable, ["audit", "--audit-level=high"], root);
  const scripts = await projectScripts(root);
  if (scripts["audit:dotnet"] === undefined)
    throw new Error("Required server dependency audit script is missing: audit:dotnet.");
  await run(npmExecutable, ["run", "audit:dotnet"], root);
}

async function health(): Promise<void> {
  await doctor();
  const root = await requireProject();
  const scripts = await projectScripts(root);
  if (scripts.verify === undefined)
    throw new Error("Required project health script is missing: verify.");
  await run(npmExecutable, ["run", "verify"], root);
  process.stdout.write("DotReact health: architecture, contracts, security, tests, bundles and dependencies are healthy.\n");
}

async function architecture(): Promise<void> {
  const root = await requireProject();
  await assertArchitecture(root);
}

async function assertArchitecture(root: string): Promise<void> {
  const report = await validateProjectArchitecture(root);
  process.stdout.write(`${formatArchitectureReport(report)}\n`);
  if (report.issues.some(issue => issue.severity === "error"))
    throw new Error("Project architecture does not satisfy the strict App Router contract.");
}

async function start(): Promise<void> {
  const root = await requireProject();
  await buildProject();
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
    resolve(root, "node_modules/@rafagouveia/dotreact-renderer/dist"),
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
  const projectSource = await readFile(resolve(root, "Server/Server.csproj"), "utf8");
  const assemblyName = /<AssemblyName>([^<]+)<\/AssemblyName>/u.exec(projectSource)?.[1]?.trim() || "Server";
  await run(dotnetExecutable, [`${assemblyName}.dll`], publishRoot, startEnvironment);
}

async function doctor(): Promise<void> {
  await run(process.execPath, ["--version"]);
  await run(dotnetExecutable, ["--version"]);
  const root = await requireProject();
  const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  for (const script of [
    "dev", "build", "build:client", "build:ssr", "generate", "typecheck",
    "check:contracts", "verify", "analyze", "audit:dotnet"
  ]) {
    if (!packageJson.scripts?.[script]) throw new Error(`Required npm script is missing: ${script}`);
  }
  const vendorRuntime = await exists(resolve(root, "vendor"));
  for (const path of [
    "public",
    "lighthouserc.cjs",
    "scripts/lighthouse-audit.mjs",
    "scripts/audit-dotnet-packages.mjs",
    "deploy/azure/app-service.bicep",
    "deploy/azure/container-apps.bicep"
  ]) if (!await exists(resolve(root, path)))
    throw new Error(`Required framework-owned project asset is missing: ${path}`);
  if (!await exists(resolve(root, "Dockerfile")) && !await exists(resolve(root, "Dockerfile.scaffold")))
    throw new Error("Required production container definition is missing: Dockerfile.");
  const legacyRuntime = await exists(resolve(root, "framework"));
  if (vendorRuntime && legacyRuntime)
    throw new Error("Both vendor/ and legacy framework/ runtimes exist. Keep only the pinned vendor/ runtime.");
  if (legacyRuntime)
    throw new Error("Legacy framework/ runtime detected. Recreate the project with published package dependencies.");
  if (vendorRuntime) {
    for (const file of [
      "vendor/README.md",
      "vendor/dotreact-runtime.json",
      "vendor/DotReact.AspNetCore/DotReact.AspNetCore.csproj",
      "vendor/DotReact.AppGenerator/DotReact.AppGenerator.csproj",
      "vendor/DotReact.Hosting/DotReact.Hosting.csproj",
      "vendor/renderer/package.json",
      "vendor/client/package.json",
      "vendor/font/package.json",
      "vendor/script/package.json"
    ]) if (!await exists(resolve(root, file))) throw new Error(`Managed runtime is incomplete: ${file}`);
    const runtime = JSON.parse(await readFile(resolve(root, "vendor/dotreact-runtime.json"), "utf8")) as {
      schemaVersion?: number;
      frameworkVersion?: string;
    };
    if (runtime.schemaVersion !== 1 || typeof runtime.frameworkVersion !== "string")
      throw new Error("Managed runtime metadata is invalid. Run dotreact upgrade from a valid framework checkout.");
    const cliVersion = await frameworkVersion();
    if (runtime.frameworkVersion !== cliVersion)
      throw new Error(`DotReact CLI ${cliVersion} cannot diagnose managed runtime ${runtime.frameworkVersion}. Use the project-local CLI.`);
    process.stdout.write(`[dotreact] Managed runtime ${runtime.frameworkVersion}.\n`);
  } else {
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    const dotReactPackages = Object.entries(dependencies)
      .filter(([name]) => name.startsWith("@rafagouveia/dotreact-"));
    if (dotReactPackages.length === 0)
      throw new Error("No DotReact npm packages are declared. Recreate the project or restore package.json.");
    const invalid = dotReactPackages.find(([, version]) => !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version));
    if (invalid !== undefined)
      throw new Error(`DotReact package ${invalid[0]} must use an exact published version, not '${invalid[1]}'.`);
    const versions = new Set(dotReactPackages.map(([, version]) => version));
    if (versions.size !== 1)
      throw new Error("DotReact npm packages must use one aligned framework version. Run dotreact upgrade <version>.");
    const frameworkPackageVersion = [...versions][0]!;
    const cliVersion = await frameworkVersion();
    if (frameworkPackageVersion !== cliVersion)
      throw new Error(`DotReact CLI ${cliVersion} does not match project packages ${frameworkPackageVersion}. Run npm install and use the project-local CLI.`);
    const projectSource = await readFile(resolve(root, "Server/Server.csproj"), "utf8");
    for (const packageName of ["DotReact.Hosting", "DotReact.AppGenerator"]) {
      const reference = new RegExp(`<PackageReference Include="${packageName.replace(".", "\\.")}" Version="([^\"]+)"`, "u")
        .exec(projectSource);
      if (reference === null)
        throw new Error(`Server.csproj is missing the published ${packageName} package reference.`);
      if (reference[1] !== frameworkPackageVersion)
        throw new Error(`${packageName} must use DotReact ${frameworkPackageVersion}, not ${reference[1]}.`);
    }
    const toolManifest = JSON.parse(await readFile(resolve(root, ".config/dotnet-tools.json"), "utf8")) as {
      tools?: Record<string, { version?: string }>;
    };
    if (toolManifest.tools?.["dotreact.typegen.tool"]?.version !== frameworkPackageVersion)
      throw new Error("DotReact TypeGen must use the same version as the npm runtime packages.");
    process.stdout.write(`[dotreact] Published package runtime ${frameworkPackageVersion}.\n`);
  }
  for (const file of ["src/contracts.ts", "src/actions.ts", "src/backend-manifest.json"]) {
    if (!await exists(resolve(root, file))) throw new Error(`Generated boundary artifact is missing: ${file}`);
  }
  await assertArchitecture(root);
  process.stdout.write(`[dotreact] Project zones: routes and presentation=app/; backend=Server/; public assets=public/; generated=src/contracts.ts,src/actions.ts,src/backend-manifest.json; runtime=${vendorRuntime ? "vendor/" : "packages"}.\n`);
  process.stdout.write("DotReact doctor: runtimes, project structure and scripts are ready.\n");
}

async function upgrade(values: string[]): Promise<void> {
  const root = await requireProject();
  if (!await exists(resolve(root, "vendor"))) {
    await upgradePackages(root, values);
    return;
  }
  const sourceOption = optionValue(values, "--from");
  const allowed = new Set(["--from", "--dry-run"]);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]!;
    if (!allowed.has(value)) throw new Error("Use: dotreact upgrade --from <framework-root> [--dry-run].");
    if (value === "--from") index += 1;
  }
  const sourceRoot = resolve(sourceOption ?? repoRoot);
  if (!await exists(resolve(sourceRoot, "dotnet/src/DotReact.AspNetCore/DotReact.AspNetCore.csproj"))
    || !await exists(resolve(sourceRoot, "packages/renderer/package.json")))
    throw new Error("--from must point to a complete DotReact framework checkout.");
  if (!await exists(resolve(root, "vendor")))
    throw new Error("This project has no managed vendor/ runtime to upgrade.");
  const sourcePackage = JSON.parse(await readFile(resolve(sourceRoot, "package.json"), "utf8")) as { version?: string };
  if (values.includes("--dry-run")) {
    process.stdout.write(`Would upgrade vendor/ to DotReact ${sourcePackage.version ?? "preview"} from ${sourceRoot}.\nNo files were written.\n`);
    return;
  }

  const operationRoot = resolve(root, ".dotreact", `runtime-upgrade-${randomUUID()}`);
  const stagedVendor = resolve(operationRoot, "vendor");
  const backupVendor = resolve(operationRoot, "previous-vendor");
  await mkdir(operationRoot, { recursive: true });
  try {
    await copyRuntime(sourceRoot, stagedVendor);
    let usedInPlaceFallback = false;
    try {
      await rename(resolve(root, "vendor"), backupVendor);
    } catch (error) {
      const code = error instanceof Error && "code" in error ? String(error.code) : "";
      if (process.platform !== "win32" || !["EPERM", "EACCES"].includes(code)) throw error;
      usedInPlaceFallback = true;
      await cp(resolve(root, "vendor"), backupVendor, { recursive: true, filter: shouldCopyExecutablePackage });
      await clearDirectoryContents(resolve(root, "vendor"));
    }
    try {
      if (usedInPlaceFallback) {
        await cp(stagedVendor, resolve(root, "vendor"), { recursive: true });
        await rm(stagedVendor, { recursive: true, force: true });
      } else {
        await rename(stagedVendor, resolve(root, "vendor"));
      }
    } catch (error) {
      if (usedInPlaceFallback) {
        await clearDirectoryContents(resolve(root, "vendor"));
        await cp(backupVendor, resolve(root, "vendor"), { recursive: true });
      } else {
        await rename(backupVendor, resolve(root, "vendor"));
      }
      throw error;
    }
    await rm(backupVendor, { recursive: true, force: true });
    process.stdout.write(`Upgraded vendor/ to DotReact ${sourcePackage.version ?? "preview"}.\nNext: npm install && npm run dotreact:runtime && npm run verify\n`);
  } catch (error) {
    if (!await exists(resolve(root, "vendor")) && await exists(backupVendor))
      await rename(backupVendor, resolve(root, "vendor"));
    throw new Error(`Runtime upgrade failed without changing application files: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await rm(operationRoot, { recursive: true, force: true });
  }
}

async function upgradePackages(root: string, values: string[]): Promise<void> {
  const version = values.find(value => !value.startsWith("--"));
  if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)
    || values.some(value => value !== version && value !== "--dry-run"))
    throw new Error("Use: dotreact upgrade <version> [--dry-run].");

  const packagePath = resolve(root, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  let updatedPackages = 0;
  for (const group of [packageJson.dependencies, packageJson.devDependencies]) {
    if (group === undefined) continue;
    for (const dependency of Object.keys(group)) {
      if (!dependency.startsWith("@rafagouveia/dotreact-")) continue;
      group[dependency] = version;
      updatedPackages += 1;
    }
  }
  if (updatedPackages === 0) throw new Error("No DotReact npm packages were found in package.json.");

  const csprojPath = resolve(root, "Server/Server.csproj");
  const csproj = await readFile(csprojPath, "utf8");
  const packageReference = /(<PackageReference Include="DotReact\.(?:Hosting|AppGenerator)" Version=")[^"]+("[^>]*>)/gu;
  if ([...csproj.matchAll(packageReference)].length !== 2)
    throw new Error("Server.csproj must reference the DotReact.Hosting and DotReact.AppGenerator packages.");
  const updatedCsproj = csproj.replace(packageReference, `$1${version}$2`);

  const toolPath = resolve(root, ".config/dotnet-tools.json");
  const toolManifest = JSON.parse(await readFile(toolPath, "utf8")) as {
    tools?: Record<string, { version?: string }>;
  };
  const typeGen = toolManifest.tools?.["dotreact.typegen.tool"];
  if (typeGen === undefined) throw new Error("The DotReact TypeGen local tool is missing from .config/dotnet-tools.json.");
  typeGen.version = version;

  if (values.includes("--dry-run")) {
    process.stdout.write(`Would align ${updatedPackages} npm packages, 2 NuGet references and TypeGen to DotReact ${version}.\nNo files were written.\n`);
    return;
  }
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  await writeFile(csprojPath, updatedCsproj);
  await writeFile(toolPath, `${JSON.stringify(toolManifest, null, 2)}\n`);
  process.stdout.write(`Aligned npm, NuGet and TypeGen dependencies to DotReact ${version}.\nNext: npm install && npm run verify\n`);
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
  if (!kind || !["page", "layout", "action", "boundary", "component"].includes(kind))
    throw new Error("Use: dotreact generate <page|layout|action|boundary|component> <name>.");
  const name = values[1];
  const boundaryValue = optionValue(values, "--kind");
  if (boundaryValue !== undefined && boundaryValue !== "error" && boundaryValue !== "not-found"
    && boundaryValue !== "loading" && boundaryValue !== "global-error")
    throw new Error("--kind must be error, not-found, loading or global-error.");
  const boundary: "error" | "not-found" | "loading" | "global-error" | undefined = boundaryValue;
  const dryRun = values.includes("--dry-run");
  const route = optionValue(values, "--route");
  const options = {
    ...(boundary === undefined ? {} : { boundaryKind: boundary }),
    ...(route === undefined ? {} : { route }),
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

function optionalPositiveNumberOption(values: string[], name: string): number | undefined {
  const raw = optionValue(values, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive number.`);
  return value;
}

function optionalRateOption(values: string[], name: string): number | undefined {
  const raw = optionValue(values, name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1)
    throw new Error(`${name} must be a number between 0 and 1.`);
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

async function routes(values: string[]): Promise<void> {
  if (values.some((value, index) => value !== "--url" && values[index - 1] !== "--url"))
    throw new Error("Use: dotreact routes [--url http://127.0.0.1:5080].");
  const root = await requireProject();
  const report = await inspectRoutes(root, optionValue(values, "--url"));
  process.stdout.write(`${formatRouteDiagnostics(report)}\n`);
}

async function benchmark(values: string[]): Promise<void> {
  await requireProject();
  const url = values[0] && !values[0].startsWith("--") ? values[0] : "http://127.0.0.1:5080/";
  const options = {
    url,
    requests: integerOption(values, "--requests", 100),
    concurrency: integerOption(values, "--concurrency", 8),
    warmup: Number(optionValue(values, "--warmup") ?? "5"),
    timeoutMs: integerOption(values, "--timeout-ms", 10_000),
    maxResponseBytes: integerOption(values, "--max-response-kb", 5 * 1024) * 1024
  };
  const candidate = await benchmarkUrl(options);
  const baselineUrl = optionValue(values, "--compare");
  if (baselineUrl === undefined) {
    process.stdout.write(values.includes("--json")
      ? `${JSON.stringify({ schemaVersion: 1, url, options, result: candidate }, null, 2)}\n`
      : `${formatBenchmark(candidate)}\n`);
    if (candidate.failures > 0) throw new Error(`Benchmark completed with ${candidate.failures} failed request(s).`);
    return;
  }

  const baseline = await benchmarkUrl({ ...options, url: baselineUrl });
  const comparison = compareBenchmarkResults(url, candidate, baselineUrl, baseline);
  const maxP95Ratio = optionalPositiveNumberOption(values, "--max-p95-ratio");
  const minThroughputRatio = optionalPositiveNumberOption(values, "--min-throughput-ratio");
  const thresholds: BenchmarkThresholds = {
    ...(maxP95Ratio === undefined ? {} : { maxP95Ratio }),
    ...(minThroughputRatio === undefined ? {} : { minThroughputRatio }),
    maxFailureRate: optionalRateOption(values, "--max-failure-rate") ?? 0
  };
  const thresholdFailures = evaluateBenchmarkThresholds(comparison, thresholds);
  process.stdout.write(values.includes("--json")
    ? `${JSON.stringify({ schemaVersion: 1, options, comparison, thresholds, passed: thresholdFailures.length === 0, failures: thresholdFailures }, null, 2)}\n`
    : `${formatBenchmarkComparison(comparison)}\n`);
  if (baseline.failures > 0)
    throw new Error(`Baseline benchmark completed with ${baseline.failures} failed request(s); comparison is not valid.`);
  if (thresholdFailures.length > 0)
    throw new Error(`Performance gate failed: ${thresholdFailures.join("; ")}.`);
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
    "  dotreact version                         Show the effective CLI version",
    "  dotreact create <name> [--template starter|minimal]",
    "  dotreact templates",
    "  dotreact generate page <route> [--dry-run]",
    "  dotreact generate layout <route>",
    "  dotreact generate boundary <route> --kind <error|not-found|loading|global-error>",
    "  dotreact generate action <PascalCaseName> [--route <route>]",
    "  dotreact generate component <PascalCaseName> [--route <route>]",
    "  dotreact add ...                         Alias for generate",
    "  dotreact sync [--watch]                  Regenerate C# to TypeScript artifacts",
    "  dotreact dev",
    "  dotreact build",
    "  dotreact analyze [--max-client-kb 100] [--max-initial-client-kb 75] [--max-async-chunk-kb 30] [--max-css-kb 40] [--max-ssr-kb 50]",
    "  dotreact routes [--url http://127.0.0.1:5080]  Explain SSR, prerender/ISR and hydration per route",
    "  dotreact benchmark [url] [--compare baseline-url] [--requests 100] [--concurrency 8] [--max-response-kb 5120] [--json]",
    "                     [--max-p95-ratio 1.10] [--min-throughput-ratio 0.90] [--max-failure-rate 0]",
    "  dotreact export [--routes /,/products/1] [--url http://127.0.0.1:5080] [--out dist/static]",
    "  dotreact check",
    "  dotreact architecture                   Validate the strict App Router folder contract",
    "  dotreact security [--static-only]        Audit application source and client/server dependencies",
    "  dotreact health                          Run the complete project release gate",
    "  dotreact start",
    "  dotreact doctor",
    "  dotreact upgrade <version> [--dry-run]    Align npm, NuGet and TypeGen packages",
    "  dotreact upgrade --from <framework-root>  Migrate a legacy vendored preview runtime",
    "  dotreact workspace <focus|reveal|status>  Control advanced infrastructure visibility"
  ].join("\n") + "\n");
}

try {
  if (command === "version" || command === "--version" || command === "-v")
    process.stdout.write(`${await frameworkVersion()}\n`);
  else if (command === "create") await create(args[0], optionValue(args, "--template"));
  else if (command === "templates") process.stdout.write("Available templates:\n  starter  SSR, hydration, actions, Docker and Azure health checks\n  minimal  One SSR page, hydration, boundaries and production runtime\n");
  else if (command === "generate" || command === "add") await generate(args);
  else if (command === "sync") await sync(args);
  else if (command === "dev") await runProjectScript("dev");
  else if (command === "build") await buildProject();
  else if (command === "analyze") await analyze(args);
  else if (command === "routes") await routes(args);
  else if (command === "benchmark") await benchmark(args);
  else if (command === "export") await exportStatic(args);
  else if (command === "check") await check();
  else if (command === "architecture") await architecture();
  else if (command === "security") await security(args);
  else if (command === "health") await health();
  else if (command === "start") await start();
  else if (command === "doctor") await doctor();
  else if (command === "upgrade") await upgrade(args);
  else if (command === "workspace") await workspace(args);
  else help();
} catch (error) {
  process.stderr.write(`[dotreact] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
