#!/usr/bin/env node
import { access, cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { addArtifact, type ScaffoldKind } from "./scaffolding.js";
import { analyzeBundles, formatReport } from "./performance.js";
import { benchmarkUrl, formatBenchmark } from "./benchmark.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const [command = "help", ...args] = process.argv.slice(2);
const shouldCopy = (source: string): boolean => !/[\\/](\.git|node_modules|dist|bin|obj|\.dotreact|coverage|TestResults|\.playwright-cli)([\\/]|$)/.test(source);

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
  await cp(resolve(repoRoot, "global.json"), resolve(target, "global.json"));
  await cp(resolve(repoRoot, "dotnet/Directory.Build.props"), resolve(target, "Directory.Build.props"));
  await cp(resolve(repoRoot, "dotnet/src/DotReact.AspNetCore"), resolve(target, "framework/DotReact.AspNetCore"), { recursive: true, filter: shouldCopy });
  await cp(resolve(repoRoot, "dotnet/src/DotReact.TypeGen"), resolve(target, "framework/DotReact.TypeGen"), { recursive: true, filter: shouldCopy });
  await cp(resolve(repoRoot, "dotnet/Directory.Build.props"), resolve(target, "framework/Directory.Build.props"));
  await cp(resolve(repoRoot, "packages/protocol"), resolve(target, "framework/protocol"), { recursive: true, filter: shouldCopy });
  await cp(resolve(repoRoot, "packages/renderer"), resolve(target, "framework/renderer"), { recursive: true, filter: shouldCopy });
  await cp(resolve(repoRoot, "packages/client"), resolve(target, "framework/client"), { recursive: true, filter: shouldCopy });
  await cp(resolve(repoRoot, "packages/vite"), resolve(target, "framework/vite"), { recursive: true, filter: shouldCopy });
  await cp(resolve(repoRoot, "packages/cli"), resolve(target, "framework/cli"), { recursive: true, filter: shouldCopy });
  await cp(resolve(repoRoot, "tsconfig.base.json"), resolve(target, "tsconfig.base.json"));
  const csprojPath = resolve(target, "Server/Server.csproj");
  const csproj = await readFile(csprojPath, "utf8");
  await writeFile(csprojPath, csproj.replace("../../../dotnet/src/DotReact.AspNetCore/DotReact.AspNetCore.csproj", "../framework/DotReact.AspNetCore/DotReact.AspNetCore.csproj"));
  const packagePath = resolve(target, "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    name: string;
  };
  packageJson.name = name.toLowerCase();
  packageJson.dependencies["@dotreact/protocol"] = "file:framework/protocol";
  packageJson.dependencies["@dotreact/renderer"] = "file:framework/renderer";
  packageJson.dependencies["@dotreact/client"] = "file:framework/client";
  packageJson.devDependencies["@dotreact/vite"] = "file:framework/vite";
  packageJson.devDependencies["@dotreact/cli"] = "file:framework/cli";
  const scripts = (packageJson as unknown as { scripts: Record<string, string> }).scripts;
  scripts["build:framework"] = "npm run build --prefix framework/protocol && npm run build --prefix framework/renderer && npm run build --prefix framework/client && npm run build --prefix framework/vite && npm run build --prefix framework/cli";
  scripts.drx = "dotreact";
  scripts.prepare = "npm run build:framework";
  scripts["dev:renderer"] = (scripts["dev:renderer"] ?? "").replace("../../packages/renderer/dist/server.js", "framework/renderer/dist/server.js");
  scripts.generate = (scripts.generate ?? "").replace("../../dotnet/src/DotReact.TypeGen/DotReact.TypeGen.csproj", "framework/DotReact.TypeGen/DotReact.TypeGen.csproj");
  scripts["check:contracts"] = (scripts["check:contracts"] ?? "").replace("../../dotnet/src/DotReact.TypeGen/DotReact.TypeGen.csproj", "framework/DotReact.TypeGen/DotReact.TypeGen.csproj");
  scripts.build = `npm run build:framework && ${scripts.build ?? ""}`;
  await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);
  const appTsconfigPath = resolve(target, "tsconfig.json");
  const appTsconfig = await readFile(appTsconfigPath, "utf8");
  await writeFile(appTsconfigPath, appTsconfig.replace("../../tsconfig.base.json", "./tsconfig.base.json"));
  process.stdout.write(`Created ${name}.\nNext: cd ${name} && npm install && npm run dev\n`);
  } catch (error) {
    await rm(target, { recursive: true, force: true });
    throw error;
  }
}

async function applyMinimalTemplate(target: string): Promise<void> {
  for (const path of [
    "Server/Actions",
    "Server/Pages/Products",
    "Server/DemoActionContracts.cs",
    "Server/ProductPageProps.cs",
    "src/pages/products"
  ]) await rm(resolve(target, path), { recursive: true, force: true });
  await writeFile(resolve(target, "src/pages/page.drx"), `import type { HomePageProps } from "../contracts";\nimport type { DotReactMetadata } from "@dotreact/vite";\n\nexport const metadata: DotReactMetadata = {\n  title: "DotReact minimal",\n  description: "ASP.NET Core, React SSR and hydration."\n};\n\nexport default function HomePage({ message, generatedAt }: HomePageProps) {\n  return (\n    <main className="shell">\n      <p className="eyebrow">ASP.NET Core + React SSR + DRX</p>\n      <h1>{message}</h1>\n      <p>This minimal template is ready for your first page.</p>\n      <p className="muted">Generated at {generatedAt}</p>\n    </main>\n  );\n}\n`);
  await writeFile(resolve(target, "src/contracts.ts"), `// <auto-generated by DotReact.TypeGen />\n\nexport interface HomePageProps {\n  generatedAt: string;\n  message: string;\n}\n`);
  await writeFile(resolve(target, "src/actions.ts"), `// <auto-generated by DotReact.TypeGen />\n\nimport { createServerAction } from "@dotreact/client";\n`);
  await writeFile(resolve(target, "src/backend-manifest.json"), `${JSON.stringify({
    schemaVersion: 2,
    pages: [{
      moduleId: "page",
      pattern: "/",
      routing: "convention",
      propsType: "DotReact.Starter.HomePageProps"
    }],
    actions: []
  }, null, 2)}\n`);
  await writeFile(resolve(target, "README.md"), `# DotReact minimal project\n\nASP.NET Core owns HTTP and data; React renders on the server and hydrates in the browser.\n\nThe scaffold is repository-ready but deliberately does not run \`git init\`. Run \`npm install\` and commit the resulting \`package-lock.json\` before relying on the included CI workflow. Repository defaults cover Git, editors, Node/npm, .NET and Docker.\n\n\`\`\`powershell\nnpm install\ndotreact doctor\ndotreact dev\n\`\`\`\n\nGenerate application artifacts without overwriting existing files:\n\n\`\`\`powershell\ndotreact generate page catalog/[slug]\ndotreact generate layout catalog\ndotreact generate action SaveCatalog\ndotreact sync\ndotreact check\n\`\`\`\n\nUse \`dotreact build\`, \`dotreact analyze\` and \`dotreact start\` for the production lifecycle. Set \`OTEL_EXPORTER_OTLP_ENDPOINT\` to export DotReact traces and metrics through OTLP.\n`);
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
  for (const file of ["package.json", "Server/Server.csproj", "src/entry-server.tsx"]) {
    try { await access(resolve(root, file)); }
    catch { throw new Error(`Current directory is not a DotReact project (missing ${file}).`); }
  }
  return root;
}

async function runProjectScript(script: string): Promise<void> {
  await run(npmExecutable, ["run", script], await requireProject());
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
    resolve(root, "framework/renderer/dist"),
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
  process.stdout.write("DotReact doctor: runtimes, project structure and scripts are ready.\n");
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
  if (boundaryValue !== undefined && boundaryValue !== "error" && boundaryValue !== "not-found")
    throw new Error("--kind must be error or not-found.");
  const boundary: "error" | "not-found" | undefined = boundaryValue;
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
    ssrKb: positiveNumberOption(values, "--max-ssr-kb", 50)
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

function help(): void {
  process.stdout.write([
    "DotReact CLI",
    "  dotreact create <name> [--template starter|minimal]",
    "  dotreact templates",
    "  dotreact generate page <route> [--dry-run]",
    "  dotreact generate layout <route>",
    "  dotreact generate boundary <route> --kind <error|not-found>",
    "  dotreact generate action <PascalCaseName>",
    "  dotreact add ...                         Alias for generate",
    "  dotreact sync                            Regenerate C# to TypeScript artifacts",
    "  dotreact dev",
    "  dotreact build",
    "  dotreact analyze [--max-client-kb 100] [--max-ssr-kb 50]",
    "  dotreact benchmark [url] [--requests 100] [--concurrency 8]",
    "  dotreact check",
    "  dotreact start",
    "  dotreact doctor"
  ].join("\n") + "\n");
}

try {
  if (command === "create") await create(args[0], optionValue(args, "--template"));
  else if (command === "templates") process.stdout.write("Available templates:\n  starter  SSR, hydration, actions, Docker and Azure health checks\n  minimal  One SSR page, hydration, boundaries and production runtime\n");
  else if (command === "generate" || command === "add") await generate(args);
  else if (command === "sync") await runProjectScript("generate");
  else if (command === "dev") await runProjectScript("dev");
  else if (command === "build") await runProjectScript("build");
  else if (command === "analyze") await analyze(args);
  else if (command === "benchmark") await benchmark(args);
  else if (command === "check") await check();
  else if (command === "start") await start();
  else if (command === "doctor") await doctor();
  else help();
} catch (error) {
  process.stderr.write(`[dotreact] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
