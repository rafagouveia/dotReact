import { promises as fs, readdirSync } from "node:fs";
import path from "node:path";
import { API, DiagnosticCategory, type Diagnostic } from "typescript/unstable/sync";
import { scanDotReactGraph } from "./discovery.js";
import { readBackendManifest, validateBackendPages, type BackendManifest } from "./manifest.js";

export interface DotReactCheckOptions {
  readonly root: string;
  readonly pagesDir?: string;
  readonly tsconfig?: string;
  readonly contracts?: string;
  readonly backendManifest?: string;
}

export interface DotReactDiagnostic {
  readonly category: "error" | "warning";
  readonly code: number | string;
  readonly file?: string;
  readonly line?: number;
  readonly column?: number;
  readonly message: string;
}

export interface DotReactCheckResult {
  readonly diagnostics: readonly DotReactDiagnostic[];
  readonly pageCount: number;
  readonly layoutCount: number;
  readonly boundaryCount: number;
}

function cleanMessage(message: string): string {
  return message.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u001b]/g, "").slice(0, 4_000);
}

function diagnosticMessage(diagnostic: Diagnostic): string {
  const chain = diagnostic.messageChain?.map(diagnosticMessage) ?? [];
  return cleanMessage([diagnostic.text, ...chain].filter(Boolean).join("\n"));
}

function displayFile(root: string, file: string): string {
  const mapped = file.endsWith(".drx.tsx") ? file.slice(0, -4) : file;
  const relative = path.relative(root, mapped).replaceAll("\\", "/");
  return relative.startsWith("../") || path.isAbsolute(relative) ? path.basename(mapped) : relative;
}

function fileKey(file: string): string {
  const resolved = path.resolve(file);
  return process.platform === "win32" ? resolved.toLocaleLowerCase("en-US") : resolved;
}

function lineAndColumn(content: string | undefined, position: number): { line: number; column: number } | undefined {
  if (content === undefined || position < 0) return undefined;
  const before = content.slice(0, position);
  const lines = before.split(/\r?\n/);
  return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
}

function mapDiagnostics(root: string, values: readonly Diagnostic[], sources: ReadonlyMap<string, string>): DotReactDiagnostic[] {
  return values.map(diagnostic => {
    const result: DotReactDiagnostic = {
      category: diagnostic.category === DiagnosticCategory.Warning ? "warning" : "error",
      code: diagnostic.code,
      message: diagnosticMessage(diagnostic)
    };
    if (diagnostic.fileName !== undefined) {
      const position = lineAndColumn(sources.get(fileKey(diagnostic.fileName)), diagnostic.pos);
      return {
        ...result,
        file: displayFile(root, diagnostic.fileName),
        ...(position === undefined ? {} : position)
      };
    }
    return result;
  });
}

function typeExportName(fullName: string): string {
  const name = fullName.split(/[.+]/).at(-1);
  if (name === undefined || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) throw new Error(`Unsupported generated props type: ${fullName}`);
  return name;
}

function relativeImport(fromDirectory: string, target: string, stripExtension = false): string {
  const value = stripExtension ? target.slice(0, -path.extname(target).length) : target;
  const relative = path.relative(fromDirectory, value).replaceAll("\\", "/");
  return relative.startsWith(".") ? relative : `./${relative}`;
}

function assertionSource(
  pagesRoot: string,
  contractsPath: string,
  manifest: BackendManifest | undefined,
  pages: readonly { moduleId: string; file: string }[],
  layouts: readonly { file: string }[],
  boundaries: readonly { file: string }[]
): string {
  const lines = ["import type { ComponentType, PropsWithChildren } from \"react\";"];
  lines.push("type DotReactBoundaryProps = { readonly statusCode: number; readonly requestId: string; readonly message?: string };");
  if (manifest !== undefined) {
    const names = [...new Set(manifest.pages.map(page => typeExportName(page.propsType)))].sort();
    lines.push(`import type { ${names.join(", ")} } from ${JSON.stringify(relativeImport(pagesRoot, contractsPath, true))};`);
  }
  pages.forEach((page, index) => {
    lines.push(`import Page${index} from ${JSON.stringify(relativeImport(pagesRoot, `${page.file}.tsx`, true))};`);
    const backend = manifest?.pages.find(candidate => candidate.moduleId === page.moduleId);
    if (backend !== undefined) lines.push(`const page${index}: ComponentType<${typeExportName(backend.propsType)}> = Page${index};`);
  });
  layouts.forEach((layout, index) => {
    lines.push(`import Layout${index} from ${JSON.stringify(relativeImport(pagesRoot, `${layout.file}.tsx`, true))};`);
    lines.push(`const layout${index}: ComponentType<PropsWithChildren<Record<never, never>>> = Layout${index};`);
  });
  boundaries.forEach((boundary, index) => {
    lines.push(`import Boundary${index} from ${JSON.stringify(relativeImport(pagesRoot, `${boundary.file}.tsx`, true))};`);
    lines.push(`const boundary${index}: ComponentType<DotReactBoundaryProps> = Boundary${index};`);
  });
  return lines.join("\n") + "\n";
}

export async function checkDotReactProject(options: DotReactCheckOptions): Promise<DotReactCheckResult> {
  const root = await fs.realpath(options.root);
  const graph = await scanDotReactGraph(root, options.pagesDir);
  const configPath = path.resolve(root, options.tsconfig ?? "tsconfig.json");
  const rawConfig = JSON.parse(await fs.readFile(configPath, "utf8")) as { compilerOptions?: { plugins?: unknown } };
  if (rawConfig.compilerOptions?.plugins !== undefined) throw new Error("DotReact check does not load TypeScript compiler plugins.");

  const manifest = options.backendManifest === undefined ? undefined : await readBackendManifest(root, options.backendManifest);
  if (manifest !== undefined) validateBackendPages(graph.pages, manifest);
  const contractsPath = path.resolve(root, options.contracts ?? "src/contracts.ts");
  const virtualFiles = new Map<string, string>();
  for (const file of [...graph.pages.map(page => page.file), ...graph.layouts.map(layout => layout.file)]) {
    virtualFiles.set(fileKey(`${file}.tsx`), await fs.readFile(file, "utf8"));
  }
  for (const boundary of graph.boundaries) virtualFiles.set(fileKey(`${boundary.file}.tsx`), await fs.readFile(boundary.file, "utf8"));
  const assertionFile = fileKey(path.join(graph.pagesRoot, "__dotreact_contract_check__.tsx"));
  virtualFiles.set(assertionFile, assertionSource(graph.pagesRoot, contractsPath, manifest, graph.pages, graph.layouts, graph.boundaries));

  function virtualDirectoryExists(directoryName: string): boolean {
    const directory = fileKey(directoryName);
    return [...virtualFiles.keys()].some(file => path.dirname(file) === directory || file.startsWith(`${directory}${path.sep}`));
  }

  function accessibleEntries(directoryName: string): { files: string[]; directories: string[] } | undefined {
    const directory = fileKey(directoryName);
    const files = new Set<string>();
    const directories = new Set<string>();
    let exists = false;
    try {
      for (const entry of readdirSync(directoryName, { withFileTypes: true })) {
        exists = true;
        if (entry.isDirectory()) directories.add(entry.name);
        else files.add(entry.name);
      }
    } catch { /* a purely virtual directory is still valid */ }
    for (const file of virtualFiles.keys()) {
      const relative = path.relative(directory, file);
      if (relative.startsWith("..") || path.isAbsolute(relative)) continue;
      const [first, ...rest] = relative.split(path.sep);
      if (first === undefined || first.length === 0) continue;
      exists = true;
      if (rest.length === 0) files.add(first);
      else directories.add(first);
    }
    return exists ? { files: [...files], directories: [...directories] } : undefined;
  }

  const api = new API({
    cwd: root,
    fs: {
      directoryExists(directoryName) { return virtualDirectoryExists(directoryName) ? true : undefined; },
      getAccessibleEntries: accessibleEntries,
      fileExists(fileName) { return virtualFiles.has(fileKey(fileName)) ? true : undefined; },
      readFile(fileName) { return virtualFiles.get(fileKey(fileName)); },
      realpath(fileName) { return virtualFiles.has(fileKey(fileName)) ? fileKey(fileName) : undefined; }
    }
  });
  try {
    const snapshot = api.updateSnapshot({ openProjects: [configPath], openFiles: [...virtualFiles.keys()] });
    try {
      const projects = new Map<string, NonNullable<ReturnType<typeof snapshot.getProject>>>();
      const configuredProject = snapshot.getProject(configPath);
      if (configuredProject !== undefined) projects.set(configuredProject.id, configuredProject);
      const virtualProjects = new Map<string, NonNullable<ReturnType<typeof snapshot.getProject>>>();
      for (const file of virtualFiles.keys()) {
        const project = snapshot.getDefaultProjectForFile(file);
        if (project !== undefined) {
          projects.set(project.id, project);
          virtualProjects.set(file, project);
        }
      }
      if (projects.size === 0) throw new Error(`TypeScript could not load project: ${configPath}`);

      const values: Diagnostic[] = [];
      for (const project of projects.values()) {
        const program = project.program;
        values.push(
          ...program.getConfigFileParsingDiagnostics(),
          ...program.getProgramDiagnostics(),
          ...program.getGlobalDiagnostics(),
          ...program.getSyntacticDiagnostics(),
          ...program.getBindDiagnostics(),
          ...program.getSemanticDiagnostics()
        );
      }
      // Open virtual .drx documents may live in inferred projects even when a
      // configured project is also open. Ask their owning project explicitly so
      // diagnostics can never disappear merely because tsconfig excludes *.drx.
      for (const [file, project] of virtualProjects) {
        const program = project.program;
        values.push(
          ...program.getSyntacticDiagnostics(file),
          ...program.getBindDiagnostics(file),
          ...program.getSemanticDiagnostics(file)
        );
      }
      const sourceMap = new Map(virtualFiles);
      for (const diagnostic of values) {
        if (diagnostic.fileName !== undefined && !sourceMap.has(fileKey(diagnostic.fileName))) {
          try { sourceMap.set(fileKey(diagnostic.fileName), await fs.readFile(diagnostic.fileName, "utf8")); } catch { /* diagnostic remains positionless */ }
        }
      }
      const unique = new Map<string, DotReactDiagnostic>();
      for (const diagnostic of mapDiagnostics(root, values, sourceMap)) {
        const key = `${diagnostic.code}:${diagnostic.file ?? ""}:${diagnostic.line ?? 0}:${diagnostic.column ?? 0}:${diagnostic.message}`;
        unique.set(key, diagnostic);
      }
      return { diagnostics: [...unique.values()], pageCount: graph.pages.length, layoutCount: graph.layouts.length, boundaryCount: graph.boundaries.length };
    } finally {
      snapshot.dispose();
    }
  } finally {
    api.close();
  }
}
