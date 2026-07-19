import path from "node:path";
import { transformWithOxc, type Plugin, type ResolvedConfig, type ViteDevServer } from "vite";
import { isContained, realpathOrResolved, scanDotReactGraph, scanDotReactPages, type DotReactBoundary, type DotReactBoundaryKind, type DotReactGraph, type DotReactLayout, type DotReactPage, type DotReactPageBoundaries } from "./discovery.js";
import { readBackendManifest, validateBackendPages } from "./manifest.js";

export { checkDotReactProject, type DotReactCheckOptions, type DotReactCheckResult, type DotReactDiagnostic } from "./check.js";
export { scanDotReactGraph, scanDotReactPages, type DotReactBoundary, type DotReactBoundaryKind, type DotReactGraph, type DotReactLayout, type DotReactPage, type DotReactPageBoundaries } from "./discovery.js";
export { inferDotReactRoute } from "./routes.js";

const publicVirtualId = "virtual:dotreact/pages";
const resolvedVirtualId = `\0${publicVirtualId}`;

export interface DotReactOptions {
  /** Directory containing DRX pages, relative to the Vite root. */
  readonly pagesDir?: string;
  /** TypeGen backend manifest. When set, frontend/backend page IDs must match exactly. */
  readonly backendManifest?: string | false;
}

/** Framework-owned props supplied to `not-found.drx` and `error.drx`. */
export interface DotReactBoundaryProps {
  readonly statusCode: number;
  readonly requestId: string;
  readonly message?: string;
}

/** Safely structured document metadata emitted by a DRX page or boundary. */
export interface DotReactMetadata {
  readonly title?: string;
  readonly description?: string;
  readonly noIndex?: boolean;
  readonly links?: readonly Readonly<Record<string, string>>[];
}

export type DotReactMetadataResolver<Props> = DotReactMetadata | ((props: Props) => DotReactMetadata);

function fsImport(file: string): string {
  return `/@fs/${file.replaceAll("\\", "/")}`;
}

function virtualModule(graph: DotReactGraph): string {
  const imports = ["import { createElement } from \"react\";"];
  const layoutIndexes = new Map<string, number>();
  graph.layouts.forEach((layout, index) => {
    layoutIndexes.set(layout.file, index);
    imports.push(`import Layout${index} from ${JSON.stringify(fsImport(layout.file))};`);
  });
  graph.pages.forEach((page, index) => imports.push(`import * as page${index} from ${JSON.stringify(fsImport(page.file))};`));
  const boundaryIndexes = new Map<string, number>();
  graph.boundaries.forEach((boundary, index) => {
    boundaryIndexes.set(boundary.file, index);
    imports.push(`import * as boundary${index} from ${JSON.stringify(fsImport(boundary.file))};`);
  });

  const wrappers: string[] = [];
  const entries = graph.pages.map((page, index) => {
    if (page.layouts.length === 0) return `${JSON.stringify(page.moduleId)}: page${index}`;
    let expression = `createElement(page${index}.default, props)`;
    for (const layout of [...page.layouts].reverse()) {
      expression = `createElement(Layout${layoutIndexes.get(layout)}, null, ${expression})`;
    }
    wrappers.push(`function DotReactPage${index}(props) { return ${expression}; }`);
    wrappers.push(`const composedPage${index} = Object.freeze({ ...page${index}, default: DotReactPage${index} });`);
    return `${JSON.stringify(page.moduleId)}: composedPage${index}`;
  });
  const boundaryEntries = graph.pages.map(page => {
    const values = [
      page.boundaries.notFound === undefined ? undefined : `notFound: boundary${boundaryIndexes.get(page.boundaries.notFound)}`,
      page.boundaries.error === undefined ? undefined : `error: boundary${boundaryIndexes.get(page.boundaries.error)}`
    ].filter((value): value is string => value !== undefined);
    return `${JSON.stringify(page.moduleId)}: Object.freeze({${values.join(",")}})`;
  });
  return `${imports.join("\n")}\n${wrappers.join("\n")}\nexport const pages = Object.freeze({${entries.join(",")}});\nexport const boundaries = Object.freeze({${boundaryEntries.join(",")}});\nexport default pages;\n`;
}

export function dotReact(options: DotReactOptions = {}): Plugin {
  let config: ResolvedConfig | undefined;
  let graph: DotReactGraph | undefined;
  let server: ViteDevServer | undefined;
  const pagesDir = options.pagesDir ?? "src/pages";

  const refresh = async (): Promise<void> => {
    if (config === undefined) return;
    graph = await scanDotReactGraph(config.root, pagesDir);
    if (options.backendManifest !== undefined && options.backendManifest !== false) {
      validateBackendPages(graph.pages, await readBackendManifest(config.root, options.backendManifest));
    }
  };

  const invalidateGraph = async (file: string): Promise<void> => {
    if (config === undefined) return;
    const isDrx = file.toLowerCase().endsWith(".drx");
    const isManifest = options.backendManifest !== undefined && options.backendManifest !== false
      && path.resolve(file) === path.resolve(config.root, options.backendManifest);
    if (!isDrx && !isManifest) return;
    const configuredRoot = path.resolve(config.root, pagesDir);
    if (isDrx && !isContained(configuredRoot, path.resolve(file))) return;
    await refresh();
    const module = server?.moduleGraph.getModuleById(resolvedVirtualId);
    if (module !== undefined) server?.moduleGraph.invalidateModule(module);
  };

  return {
    name: "dotreact:drx",
    enforce: "pre",
    configResolved(resolved) { config = resolved; },
    async buildStart() {
      await refresh();
      for (const page of graph?.pages ?? []) this.addWatchFile(page.file);
      for (const layout of graph?.layouts ?? []) this.addWatchFile(layout.file);
      for (const boundary of graph?.boundaries ?? []) this.addWatchFile(boundary.file);
      if (config !== undefined && options.backendManifest !== undefined && options.backendManifest !== false) {
        this.addWatchFile(path.resolve(config.root, options.backendManifest));
      }
    },
    configureServer(viteServer) {
      server = viteServer;
      const configuredRoot = path.resolve(viteServer.config.root, pagesDir);
      viteServer.watcher.add(configuredRoot);
      if (options.backendManifest !== undefined && options.backendManifest !== false) {
        viteServer.watcher.add(path.resolve(viteServer.config.root, options.backendManifest));
      }
      const changed = (file: string): void => { void invalidateGraph(file); };
      viteServer.watcher.on("add", changed);
      viteServer.watcher.on("change", changed);
      viteServer.watcher.on("unlink", changed);
      viteServer.httpServer?.once("close", () => {
        viteServer.watcher.off("add", changed);
        viteServer.watcher.off("change", changed);
        viteServer.watcher.off("unlink", changed);
      });
    },
    resolveId(id) { return id === publicVirtualId ? resolvedVirtualId : null; },
    async load(id) {
      if (id !== resolvedVirtualId) return null;
      await refresh();
      return virtualModule(graph ?? { root: "", pagesRoot: "", pages: [], layouts: [], boundaries: [] });
    },
    async transform(code, id) {
      const cleanId = id.split("?", 1)[0];
      if (cleanId === undefined || !cleanId.toLowerCase().endsWith(".drx") || config === undefined) return null;
      const pagesRoot = await realpathOrResolved(path.resolve(config.root, pagesDir));
      const canonicalId = await realpathOrResolved(cleanId);
      if (!isContained(pagesRoot, canonicalId)) return null;
      return transformWithOxc(code, `${cleanId}.tsx`, { lang: "tsx", sourcemap: true });
    },
    async handleHotUpdate(context) {
      const basename = path.basename(context.file).toLowerCase();
      if (basename === "layout.drx" || basename === "not-found.drx" || basename === "error.drx") {
        await refresh();
        const module = context.server.moduleGraph.getModuleById(resolvedVirtualId);
        if (module !== undefined) return [module];
      }
      return undefined;
    }
  };
}

export default dotReact;
