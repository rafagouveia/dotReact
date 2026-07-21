import { promises as fs } from "node:fs";
import path from "node:path";
import { createFontPreloadLinks, createFontStyleSheet, type DotReactFont } from "@dotreact/font";
import react from "@vitejs/plugin-react";
import { defineConfig, transformWithOxc, type Plugin, type PluginOption, type ResolvedConfig, type UserConfigExport, type ViteDevServer } from "vite";
import { isContained, realpathOrResolved, scanDotReactGraph, type DotReactGraph } from "./discovery.js";
import { readBackendManifest, validateBackendPages } from "./manifest.js";
import { collectDotReactRouteStyles, createDotReactDevelopmentStyleSheet, dotReactRouteStylePath, resolveDotReactLocalImport } from "./styles.js";

export { checkDotReactProject, type DotReactCheckOptions, type DotReactCheckResult, type DotReactDiagnostic } from "./check.js";
export { scanDotReactGraph, scanDotReactPages, type DotReactBoundary, type DotReactBoundaryKind, type DotReactGraph, type DotReactLayout, type DotReactPage, type DotReactPageBoundaries } from "./discovery.js";
export { inferDotReactRoute } from "./routes.js";
export { collectDotReactRouteStyles, createDotReactDevelopmentStyleSheet, createDotReactRouteStyleSheet, dotReactRouteStylePath, resolveDotReactLocalImport } from "./styles.js";

const publicVirtualId = "virtual:dotreact/pages";
const resolvedVirtualId = `\0${publicVirtualId}`;
const publicClientEntryId = "virtual:dotreact/client-entry";
const resolvedClientEntryId = `\0${publicClientEntryId}`;
const publicServerEntryId = "virtual:dotreact/server-entry";
const resolvedServerEntryId = `\0${publicServerEntryId}`;
const publicClientPagesId = "virtual:dotreact/client-pages";
const resolvedClientPagesId = `\0${publicClientPagesId}`;
const publicClientStylesId = "virtual:dotreact/client-styles";
const resolvedClientStylesId = `\0${publicClientStylesId}`;
const publicFontsId = "virtual:dotreact/fonts.css";
const resolvedFontsId = `\0${publicFontsId}`;
const diagnosticFramePath = "__dotreact_diagnostics/frame";
const diagnosticExtensions = new Set([".drx", ".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);

export interface DotReactDiagnosticSourceLine {
  readonly number: number;
  readonly text: string;
  readonly highlighted: boolean;
}

export interface DotReactDiagnosticSource {
  readonly file: string;
  readonly editorUri: string;
  readonly line: number;
  readonly column: number;
  readonly lines: readonly DotReactDiagnosticSourceLine[];
}

/** Resolves a browser stack-frame URL to trusted project source in development. */
export async function resolveDotReactDiagnosticFile(
  root: string,
  base: string,
  frameUrl: string
): Promise<string> {
  if (frameUrl.length === 0 || frameUrl.length > 4_096 || frameUrl.includes("\0"))
    throw new Error("Invalid DotReact diagnostic frame URL.");
  const parsed = new URL(frameUrl, "http://dotreact.local");
  let pathname = decodeURIComponent(parsed.pathname).replaceAll("\\", "/");
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  if (pathname.startsWith(normalizedBase)) pathname = `/${pathname.slice(normalizedBase.length)}`;

  let candidate: string;
  if (pathname.startsWith("/@fs/")) {
    const absolute = pathname.slice("/@fs/".length);
    candidate = /^[A-Za-z]:\//.test(absolute) ? absolute : `/${absolute}`;
  } else {
    candidate = path.resolve(root, pathname.replace(/^\/+/, ""));
  }

  const canonicalRoot = await realpathOrResolved(root);
  const canonicalFile = await realpathOrResolved(candidate);
  if (!isContained(canonicalRoot, canonicalFile) || !diagnosticExtensions.has(path.extname(canonicalFile).toLowerCase()))
    throw new Error("DotReact diagnostic source must be a project code file.");
  const stat = await fs.stat(canonicalFile);
  if (!stat.isFile()) throw new Error("DotReact diagnostic source was not found.");
  return canonicalFile;
}

function sourceWindow(source: string, requestedLine: number): readonly DotReactDiagnosticSourceLine[] {
  const all = source.replaceAll("\r\n", "\n").split("\n");
  const line = Math.min(Math.max(1, requestedLine), Math.max(1, all.length));
  const start = Math.max(1, line - 4);
  const end = Math.min(all.length, line + 4);
  return all.slice(start - 1, end).map((text, index) => ({
    number: start + index,
    text,
    highlighted: start + index === line
  }));
}

async function diagnosticSource(
  root: string,
  base: string,
  frameUrl: string,
  requestedLine: number,
  requestedColumn: number
): Promise<DotReactDiagnosticSource> {
  const file = await resolveDotReactDiagnosticFile(root, base, frameUrl);
  const source = await fs.readFile(file, "utf8");
  const line = Math.min(Math.max(1, requestedLine), Math.max(1, source.split(/\r?\n/).length));
  const column = Math.max(1, requestedColumn);
  const relative = path.relative(root, file).replaceAll("\\", "/");
  const normalizedFile = file.replaceAll("\\", "/");
  return {
    file: relative,
    editorUri: encodeURI(`vscode://file/${normalizedFile}:${line}:${column}`),
    line,
    column,
    lines: sourceWindow(source, line)
  };
}

export interface DotReactOptions {
  /** Directory containing DRX pages, relative to the Vite root. */
  readonly pagesDir?: string;
  /** TypeGen backend manifest. When set, frontend/backend page IDs must match exactly. */
  readonly backendManifest?: string | false;
  /** Global stylesheet imported by the framework-owned client entry. */
  readonly clientStyles?: string | false;
  /** Self-hosted fonts declared with `localFont` from `@dotreact/font`. */
  readonly fonts?: readonly DotReactFont[];
  /** Application-wide document metadata used when a page does not override it. */
  readonly defaultMetadata?: DotReactMetadata;
}

export interface DotReactProjectOptions extends DotReactOptions {
  /** Optional application plugins appended after the framework pipeline. */
  readonly plugins?: readonly PluginOption[];
}

/**
 * Defines the complete convention-based Vite runtime. Application projects only
 * provide supported DotReact options; entries, manifests and chunk policy remain framework-owned.
 */
export function defineDotReactConfig(options: DotReactProjectOptions = {}): UserConfigExport {
  const { plugins = [], ...runtime } = options;
  return defineConfig(({ isSsrBuild }) => ({
    plugins: [
      dotReact(runtime),
      react({ include: /\.(?:js|jsx|ts|tsx|drx)$/ }),
      ...plugins
    ],
    resolve: { dedupe: ["react", "react-dom", "@dotreact/client"] },
    optimizeDeps: {
      include: ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom", "react-dom/client"]
    },
    build: isSsrBuild ? {
      outDir: "dist/server",
      rollupOptions: {
        input: "virtual:dotreact/server-entry",
        output: { entryFileNames: "entry-server.js" }
      }
    } : {
      outDir: "dist/client",
      manifest: true,
      rollupOptions: {
        input: "virtual:dotreact/client-entry",
        output: {
          entryFileNames: "_dotreact/client.js",
          assetFileNames: "_dotreact/[name]-[hash][extname]"
        }
      }
    }
  }));
}

export interface DotReactViteApi {
  readonly routeStyleSheet: (moduleKey: string) => Promise<string>;
}

export interface DotReactRouteAssetManifest {
  readonly version: 2;
  readonly routes: readonly Readonly<{
    moduleId: string;
    hydrate: boolean;
    modules: readonly string[];
  }>[];
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
  readonly scripts?: readonly Readonly<{
    src: string;
    strategy?: "beforeInteractive" | "afterInteractive" | "lazyOnload";
    id?: string;
    type?: string;
    integrity?: string;
    crossOrigin?: "anonymous" | "use-credentials";
    referrerPolicy?: string;
  }>[];
}

export type DotReactMetadataResolver<Props> = DotReactMetadata | ((props: Props) => DotReactMetadata);

function fsImport(file: string): string {
  return `/@fs/${file.replaceAll("\\", "/")}`;
}

/** Build-time route graph consumed by the ASP.NET production asset resolver. */
export function createDotReactRouteAssetManifest(
  graph: DotReactGraph,
  root: string
): DotReactRouteAssetManifest {
  const relative = (file: string): string => path.relative(root, file).replaceAll("\\", "/");
  return Object.freeze({
    version: 2 as const,
    routes: Object.freeze(graph.pages.map(page => Object.freeze({
      moduleId: page.moduleId,
      hydrate: page.hydrate,
      modules: Object.freeze([...new Set([
        ...page.layouts,
        page.file,
        page.boundaries.notFound,
        page.boundaries.error,
        page.boundaries.loading
      ].filter((file): file is string => file !== undefined).map(relative))])
    })))
  });
}

function isFrameworkClientRuntime(file: string): boolean {
  const normalized = file.replaceAll("\\", "/").toLowerCase();
  return normalized.includes("/framework/client/")
    || normalized.includes("/vendor/client/")
    || normalized.includes("/packages/client/")
    || normalized.includes("/node_modules/@dotreact/client/");
}

function virtualModule(graph: DotReactGraph, fonts: readonly DotReactFont[]): string {
  const imports = [
    "import { createElement } from \"react\";",
    "import { dotReactDefaultBoundaries } from \"@dotreact/client/boundaries\";"
  ];
  if (graph.globalError !== undefined)
    imports.push(`import GlobalError from ${JSON.stringify(fsImport(graph.globalError))};`);
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
      expression = `createElement(Layout${layoutIndexes.get(layout)}, { pageProps: props }, ${expression})`;
    }
    wrappers.push(`function DotReactPage${index}(props) { return ${expression}; }`);
    wrappers.push(`const composedPage${index} = Object.freeze({ ...page${index}, default: DotReactPage${index} });`);
    return `${JSON.stringify(page.moduleId)}: composedPage${index}`;
  });
  const rawEntries = graph.pages.map((page, index) => `${JSON.stringify(page.moduleId)}: page${index}`);
  const layoutEntries = graph.pages.map(page =>
    `${JSON.stringify(page.moduleId)}: Object.freeze([${page.layouts.map(layout => `Layout${layoutIndexes.get(layout)}`).join(",")}])`);
  const boundaryEntries = graph.pages.map(page => {
    const values = [
      page.boundaries.notFound === undefined
        ? "notFound: dotReactDefaultBoundaries.notFound"
        : `notFound: boundary${boundaryIndexes.get(page.boundaries.notFound)}`,
      page.boundaries.error === undefined
        ? "error: dotReactDefaultBoundaries.error"
        : `error: boundary${boundaryIndexes.get(page.boundaries.error)}`,
      page.boundaries.loading === undefined
        ? "loading: dotReactDefaultBoundaries.loading"
        : `loading: boundary${boundaryIndexes.get(page.boundaries.loading)}`
    ];
    return `${JSON.stringify(page.moduleId)}: Object.freeze({${values.join(",")}})`;
  });
  const globalError = graph.globalError === undefined ? "undefined" : "GlobalError";
  const fontPreloads = JSON.stringify(createFontPreloadLinks(fonts));
  return `${imports.join("\n")}\n${wrappers.join("\n")}\nexport const pages = Object.freeze({${entries.join(",")}});\nexport const routeModules = Object.freeze({${rawEntries.join(",")}});\nexport const routeLayouts = Object.freeze({${layoutEntries.join(",")}});\nexport const boundaries = Object.freeze({${boundaryEntries.join(",")}});\nexport const fontPreloads = Object.freeze(${fontPreloads});\nexport const globalError = ${globalError};\nexport default pages;\n`;
}

function clientPagesModule(graph: DotReactGraph): string {
  const imports = ['import { dotReactDefaultBoundaries } from "@dotreact/client/boundaries";'];
  if (graph.globalError !== undefined)
    imports.push(`import GlobalError from ${JSON.stringify(fsImport(graph.globalError))};`);
  const entries = graph.pages.map((page, pageIndex) => {
    const loaders: string[] = [`import(${JSON.stringify(fsImport(page.file))})`];
    const layoutVariables: string[] = [];
    page.layouts.forEach((layout, index) => {
      loaders.push(`import(${JSON.stringify(fsImport(layout))})`);
      layoutVariables.push(`loaded[${index + 1}].default`);
    });
    const boundaryValues: string[] = [];
    const boundaryKinds = ["notFound", "error", "loading"] as const;
    for (const kind of boundaryKinds) {
      const file = page.boundaries[kind];
      if (file === undefined) boundaryValues.push(`${kind}: dotReactDefaultBoundaries.${kind}`);
      else {
        const index = loaders.length;
        loaders.push(`import(${JSON.stringify(fsImport(file))})`);
        boundaryValues.push(`${kind}: loaded[${index}]`);
      }
    }
    return `${JSON.stringify(page.moduleId)}: async function loadRoute${pageIndex}() {\n`
      + `  const loaded = await Promise.all([${loaders.join(",")}]);\n`
      + `  return Object.freeze({ page: loaded[0], layouts: Object.freeze([${layoutVariables.join(",")}]), boundaries: Object.freeze({${boundaryValues.join(",")}}) });\n`
      + "}";
  });
  const globalError = graph.globalError === undefined ? "undefined" : "GlobalError";
  return `${imports.join("\n")}\nexport const routeLoaders = Object.freeze({${entries.join(",")}});\nexport const globalError = ${globalError};\n`;
}

export function dotReact(options: DotReactOptions = {}): Plugin {
  let config: ResolvedConfig | undefined;
  let graph: DotReactGraph | undefined;
  let server: ViteDevServer | undefined;
  const pagesDir = options.pagesDir ?? "app";
  const fonts = Object.freeze([...(options.fonts ?? [])]);

  const clientEntryModule = async (): Promise<string> => {
    if (config === undefined) throw new Error("DotReact Vite configuration is not ready.");
    const configuredStyles = options.clientStyles === undefined ? "src/styles.css" : options.clientStyles;
    let stylesImport = "";
    if (configuredStyles !== false) {
      const canonicalRoot = await realpathOrResolved(config.root);
      const styles = await realpathOrResolved(path.resolve(config.root, configuredStyles));
      if (!isContained(canonicalRoot, styles))
        throw new Error(`DotReact clientStyles must be contained by the Vite root: ${configuredStyles}`);
      const stat = await fs.stat(styles);
      if (!stat.isFile()) throw new Error(`DotReact clientStyles is not a file: ${configuredStyles}`);
      stylesImport = `import ${JSON.stringify(fsImport(styles))};\n`;
    }
    const fontsImport = fonts.length === 0 ? "" : `import "${publicFontsId}";\n`;
    const routeStylesImport = config.command === "build" && !config.build.ssr && config.build.cssCodeSplit === false
      ? `import "${publicClientStylesId}";\n`
      : "";
    return `import { bootstrapDotReactLazyClient } from "@dotreact/client/bootstrap";\nimport { globalError, routeLoaders } from "${publicClientPagesId}";\n${fontsImport}${stylesImport}${routeStylesImport}await bootstrapDotReactLazyClient({ routeLoaders, globalError });\n`;
  };

  const serverEntryModule = (): string => [
    'import { createDotReactReactRuntime } from "@dotreact/renderer/react";',
    `import { boundaries, fontPreloads, pages, routeLayouts, routeModules } from "${publicVirtualId}";`,
    `const defaultMetadata = Object.freeze(${JSON.stringify(options.defaultMetadata ?? {})});`,
    "const runtime = createDotReactReactRuntime({ pages, routeModules, routeLayouts, boundaries, fontPreloads, defaultMetadata });",
    "export const render = runtime.render;",
    "export const renderStream = runtime.renderStream;"
  ].join("\n");

  const refresh = async (): Promise<void> => {
    if (config === undefined) return;
    graph = await scanDotReactGraph(config.root, pagesDir);
    if (options.backendManifest !== undefined && options.backendManifest !== false) {
      validateBackendPages(graph.pages, await readBackendManifest(config.root, options.backendManifest));
    }
  };

  const routeStyleSheet = async (moduleKey: string): Promise<string> => {
    if (config === undefined) throw new Error("DotReact Vite server is not ready.");
    let moduleId = "";
    try {
      moduleId = Buffer.from(moduleKey, "base64url").toString("utf8");
      if (Buffer.from(moduleId, "utf8").toString("base64url") !== moduleKey) moduleId = "";
    } catch { moduleId = ""; }
    if (moduleId.length === 0 || moduleId.length > 1_024 || moduleId.includes("\0"))
      throw new Error("Invalid DotReact route stylesheet module key.");
    await refresh();
    const currentGraph = graph ?? { root: config.root, pagesRoot: path.resolve(config.root, pagesDir), pages: [], layouts: [], boundaries: [] };
    if (!currentGraph.pages.some(page => page.moduleId === moduleId))
      throw new Error(`DotReact route stylesheet page was not found: ${moduleId}`);
    const styles = await collectDotReactRouteStyles(currentGraph, moduleId, async (specifier, importer) => {
      if (server !== undefined) {
        try {
          const resolved = await server.pluginContainer.resolveId(specifier, importer, { ssr: false });
          if (resolved !== null) return { id: resolved.id, external: resolved.external === true };
        } catch {
          // The private SSR renderer can expose browser-incompatible optimizer
          // conditions. Relative application imports still resolve safely below.
        }
      }
      return resolveDotReactLocalImport(config!.root, specifier, importer);
    });
    return createDotReactDevelopmentStyleSheet(
      config.root,
      config.base,
      styles,
      createFontStyleSheet(fonts)
    );
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
    const clientModule = server?.moduleGraph.getModuleById(resolvedClientPagesId);
    if (clientModule !== undefined) server?.moduleGraph.invalidateModule(clientModule);
  };

  return {
    name: "dotreact:drx",
    api: { routeStyleSheet },
    enforce: "pre",
    configResolved(resolved) { config = resolved; },
    async buildStart() {
      await refresh();
      for (const page of graph?.pages ?? []) this.addWatchFile(page.file);
      for (const layout of graph?.layouts ?? []) this.addWatchFile(layout.file);
      for (const boundary of graph?.boundaries ?? []) this.addWatchFile(boundary.file);
      if (graph?.globalError !== undefined) this.addWatchFile(graph.globalError);
      if (config !== undefined && options.backendManifest !== undefined && options.backendManifest !== false) {
        this.addWatchFile(path.resolve(config.root, options.backendManifest));
      }
    },
    generateBundle() {
      if (config === undefined || config.command !== "build" || config.build.ssr || graph === undefined) return;
      this.emitFile({
        type: "asset",
        fileName: ".vite/dotreact-routes.json",
        source: `${JSON.stringify(createDotReactRouteAssetManifest(graph, config.root), null, 2)}\n`
      });
    },
    configureServer(viteServer) {
      server = viteServer;
      const configuredRoot = path.resolve(viteServer.config.root, pagesDir);
      viteServer.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(request.url ?? "/", "http://dotreact.local");
        if (request.method === "GET" && requestUrl.pathname.endsWith(`/${diagnosticFramePath}`)) {
          try {
            const line = Number.parseInt(requestUrl.searchParams.get("line") ?? "1", 10);
            const column = Number.parseInt(requestUrl.searchParams.get("column") ?? "1", 10);
            const result = await diagnosticSource(
              viteServer.config.root,
              viteServer.config.base,
              requestUrl.searchParams.get("url") ?? "",
              Number.isSafeInteger(line) ? line : 1,
              Number.isSafeInteger(column) ? column : 1);
            response.statusCode = 200;
            response.setHeader("Cache-Control", "no-store");
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.setHeader("X-Content-Type-Options", "nosniff");
            response.end(JSON.stringify(result));
          } catch (error) {
            response.statusCode = 404;
            response.setHeader("Cache-Control", "no-store");
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.end(JSON.stringify({
              error: error instanceof Error ? error.message : "DotReact diagnostic source was not found."
            }));
          }
          return;
        }
        if (!requestUrl.pathname.endsWith(`/${dotReactRouteStylePath}`)) {
          next();
          return;
        }
        try {
          const css = await routeStyleSheet(requestUrl.searchParams.get("moduleKey") ?? "");
          response.statusCode = 200;
          response.setHeader("Cache-Control", "no-cache");
          response.setHeader("Content-Type", "text/css; charset=utf-8");
          response.end(css);
        } catch (error) {
          next(error as Error);
        }
      });
      viteServer.watcher.add(configuredRoot);
      if (options.backendManifest !== undefined && options.backendManifest !== false) {
        viteServer.watcher.add(path.resolve(viteServer.config.root, options.backendManifest));
      }
      const structuralChange = (file: string): void => { void invalidateGraph(file); };
      const contentChange = (file: string): void => {
        if (options.backendManifest !== undefined && options.backendManifest !== false
          && path.resolve(file) === path.resolve(viteServer.config.root, options.backendManifest)) {
          void invalidateGraph(file);
        }
      };
      viteServer.watcher.on("add", structuralChange);
      viteServer.watcher.on("change", contentChange);
      viteServer.watcher.on("unlink", structuralChange);
      viteServer.httpServer?.once("close", () => {
        viteServer.watcher.off("add", structuralChange);
        viteServer.watcher.off("change", contentChange);
        viteServer.watcher.off("unlink", structuralChange);
      });
    },
    resolveId(id) {
      if (id === publicVirtualId) return resolvedVirtualId;
      if (id === publicClientEntryId) return resolvedClientEntryId;
      if (id === publicServerEntryId) return resolvedServerEntryId;
      if (id === publicClientPagesId) return resolvedClientPagesId;
      if (id === publicClientStylesId) return resolvedClientStylesId;
      if (id === publicFontsId) return resolvedFontsId;
      return null;
    },
    async load(id) {
      if (id === resolvedClientEntryId) return await clientEntryModule();
      if (id === resolvedServerEntryId) return serverEntryModule();
      if (id === resolvedClientPagesId) {
        await refresh();
        return clientPagesModule(graph ?? { root: "", pagesRoot: "", pages: [], layouts: [], boundaries: [] });
      }
      if (id === resolvedClientStylesId) {
        await refresh();
        if (config === undefined) throw new Error("DotReact Vite configuration is not ready.");
        const styles = new Set<string>();
        for (const page of graph?.pages ?? []) {
          for (const style of await collectDotReactRouteStyles(graph!, page.moduleId,
            (specifier, importer) => resolveDotReactLocalImport(config!.root, specifier, importer)))
            styles.add(style);
        }
        return [...styles].map(style => `import ${JSON.stringify(fsImport(style))};`).join("\n");
      }
      if (id === resolvedFontsId) return createFontStyleSheet(fonts);
      if (id !== resolvedVirtualId) return null;
      await refresh();
      return virtualModule(graph ?? { root: "", pagesRoot: "", pages: [], layouts: [], boundaries: [] }, fonts);
    },
    async transform(code, id, transformOptions) {
      const cleanId = id.split("?", 1)[0];
      if (cleanId !== undefined && /\.server\.[cm]?[jt]sx?$/i.test(cleanId) && transformOptions?.ssr !== true) {
        throw new Error(`DotReact server-only module cannot enter the browser bundle: ${path.relative(config?.root ?? process.cwd(), cleanId)}`);
      }
      if (cleanId === undefined || !cleanId.toLowerCase().endsWith(".drx") || config === undefined) return null;
      const pagesRoot = await realpathOrResolved(path.resolve(config.root, pagesDir));
      const canonicalId = await realpathOrResolved(cleanId);
      if (!isContained(pagesRoot, canonicalId)) return null;
      return transformWithOxc(code, `${cleanId}.tsx`, { lang: "tsx", sourcemap: true });
    },
    handleHotUpdate(context) {
      // The router owns React contexts shared by the app, layouts and links. A
      // partial replacement of that runtime can temporarily leave consumers on
      // different context instances. Reload the document atomically instead;
      // application DRX modules still use state-preserving Fast Refresh.
      const isBackendManifest = config !== undefined
        && options.backendManifest !== undefined
        && options.backendManifest !== false
        && path.resolve(context.file) === path.resolve(config.root, options.backendManifest);
      if (!isFrameworkClientRuntime(context.file) && !isBackendManifest) return;
      context.server.ws.send({ type: "full-reload", path: "*" });
      return [];
    },
    // Content edits stay on the original .drx module so @vitejs/plugin-react can
    // accept them with state-preserving Fast Refresh. Structural add/unlink
    // events still invalidate the generated route registry above.
  } as Plugin;
}

export default dotReact;
