import { promises as fs } from "node:fs";
import path from "node:path";
import { inferDotReactRoute } from "./routes.js";
import { routeRequiresHydration } from "./interactivity.js";

const maxDrxFiles = 10_000;
const maxDrxBytes = 4 * 1024 * 1024;
const maxDepth = 64;

export interface DotReactPage {
  readonly moduleId: string;
  readonly file: string;
  readonly layouts: readonly string[];
  readonly boundaries: DotReactPageBoundaries;
  /** True when the route graph uses browser-only React capabilities. */
  readonly hydrate: boolean;
}

export type DotReactBoundaryKind = "not-found" | "error" | "loading";

export interface DotReactBoundary {
  readonly kind: DotReactBoundaryKind;
  readonly directory: string;
  readonly file: string;
}

export interface DotReactPageBoundaries {
  readonly notFound?: string;
  readonly error?: string;
  readonly loading?: string;
}

export interface DotReactLayout {
  readonly directory: string;
  readonly file: string;
}

export interface DotReactGraph {
  readonly root: string;
  readonly pagesRoot: string;
  readonly pages: readonly DotReactPage[];
  readonly layouts: readonly DotReactLayout[];
  readonly boundaries: readonly DotReactBoundary[];
  /** Optional application-owned fallback used for uncaught client errors in production. */
  readonly globalError?: string;
}

export function isContained(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

export async function realpathOrResolved(value: string): Promise<string> {
  try {
    return await fs.realpath(value);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return path.resolve(value);
    throw error;
  }
}

export async function scanDotReactGraph(root: string, pagesDir = "app"): Promise<DotReactGraph> {
  const canonicalRoot = await fs.realpath(root);
  const requestedPagesRoot = path.resolve(canonicalRoot, pagesDir);
  if (!isContained(canonicalRoot, requestedPagesRoot)) {
    throw new Error(`DotReact pagesDir must be contained by the Vite root: ${pagesDir}`);
  }

  const canonicalPagesRoot = await realpathOrResolved(requestedPagesRoot);
  const appRouter = path.basename(canonicalPagesRoot).toLocaleLowerCase("en-US") === "app";
  if (!isContained(canonicalRoot, canonicalPagesRoot)) {
    throw new Error(`DotReact pagesDir resolves outside the Vite root: ${pagesDir}`);
  }

  try {
    const stat = await fs.stat(canonicalPagesRoot);
    if (!stat.isDirectory()) throw new Error(`DotReact pagesDir is not a directory: ${pagesDir}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { root: canonicalRoot, pagesRoot: canonicalPagesRoot, pages: [], layouts: [], boundaries: [] };
    }
    throw error;
  }

  const discoveredPages: Array<{ moduleId: string; file: string; directory: string }> = [];
  const layouts: DotReactLayout[] = [];
  const boundaries: DotReactBoundary[] = [];
  let globalError: string | undefined;
  const visitedDirectories = new Set<string>();
  const canonicalFiles = new Map<string, string>();
  let fileCount = 0;

  async function visit(directory: string, logicalPrefix: string, depth: number): Promise<void> {
    if (depth > maxDepth) throw new Error(`DotReact pages tree exceeds ${maxDepth} directory levels.`);
    const canonicalDirectory = await fs.realpath(directory);
    if (!isContained(canonicalPagesRoot, canonicalDirectory) || visitedDirectories.has(canonicalDirectory)) return;
    visitedDirectories.add(canonicalDirectory);

    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (appRouter && entry.name.startsWith("_")) continue;
      const logicalPath = logicalPrefix === "" ? entry.name : `${logicalPrefix}/${entry.name}`;
      const candidate = path.join(directory, entry.name);
      let canonicalFile: string;
      try {
        canonicalFile = await fs.realpath(candidate);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      if (!isContained(canonicalPagesRoot, canonicalFile)) continue;

      const stat = await fs.stat(canonicalFile);
      if (stat.isDirectory()) {
        await visit(canonicalFile, logicalPath, depth + 1);
        continue;
      }
      if (!stat.isFile() || !logicalPath.toLowerCase().endsWith(".drx")) continue;
      fileCount++;
      if (fileCount > maxDrxFiles) throw new Error(`DotReact pages tree exceeds ${maxDrxFiles} DRX files.`);
      if (stat.size > maxDrxBytes) throw new Error(`DotReact file exceeds ${maxDrxBytes} bytes: ${logicalPath}`);

      const previousLogicalPath = canonicalFiles.get(canonicalFile);
      if (previousLogicalPath !== undefined) {
        const previousModuleId = previousLogicalPath.slice(0, -4);
        throw new Error(`Duplicate DotReact moduleId "${previousModuleId}" from a canonical file alias.`);
      }
      canonicalFiles.set(canonicalFile, logicalPath);

      const basename = path.posix.basename(logicalPath);
      const logicalDirectory = path.posix.dirname(logicalPath) === "." ? "" : path.posix.dirname(logicalPath);
      const specialName = basename.toLowerCase();
      if (specialName === "layout.drx") {
        if (basename !== "layout.drx") throw new Error(`DotReact layout must use exact casing 'layout.drx': ${logicalPath}`);
        if (layouts.some(layout => layout.directory.toLowerCase() === logicalDirectory.toLowerCase())) {
          throw new Error(`Duplicate DotReact layout for directory '${logicalDirectory || "/"}'.`);
        }
        layouts.push({ directory: logicalDirectory, file: canonicalFile });
      } else if (specialName === "global-error.drx") {
        if (!appRouter || logicalDirectory !== "")
          throw new Error(`DotReact global-error.drx must exist at the root of the app directory: ${logicalPath}`);
        if (basename !== "global-error.drx")
          throw new Error(`DotReact global boundary must use exact casing 'global-error.drx': ${logicalPath}`);
        if (globalError !== undefined) throw new Error("Duplicate DotReact global-error.drx boundary.");
        globalError = canonicalFile;
      } else if (specialName === "not-found.drx" || specialName === "error.drx" || specialName === "loading.drx") {
        const expectedName = specialName;
        if (basename !== expectedName) throw new Error(`DotReact boundary must use exact casing '${expectedName}': ${logicalPath}`);
        const kind: DotReactBoundaryKind = specialName === "not-found.drx" ? "not-found"
          : specialName === "error.drx" ? "error" : "loading";
        if (boundaries.some(boundary => boundary.kind === kind && boundary.directory.toLowerCase() === logicalDirectory.toLowerCase())) {
          throw new Error(`Duplicate DotReact ${kind} boundary for directory '${logicalDirectory || "/"}'.`);
        }
        boundaries.push({ kind, directory: logicalDirectory, file: canonicalFile });
      } else if (!appRouter || specialName === "page.drx") {
        if (appRouter && basename !== "page.drx")
          throw new Error(`DotReact app-router pages must use exact casing 'page.drx': ${logicalPath}`);
        discoveredPages.push({ moduleId: logicalPath.slice(0, -4), file: canonicalFile, directory: logicalDirectory });
      }
    }
  }

  await visit(canonicalPagesRoot, "", 0);
  const moduleIds = new Map<string, string>();
  for (const page of discoveredPages) {
    if (appRouter) inferDotReactRoute(page.moduleId);
    const folded = page.moduleId.toLowerCase();
    const previous = moduleIds.get(folded);
    if (previous !== undefined) throw new Error(`Duplicate DotReact moduleId "${previous}" and "${page.moduleId}".`);
    moduleIds.set(folded, page.moduleId);
  }

  layouts.sort((left, right) => left.directory.localeCompare(right.directory));
  boundaries.sort((left, right) => left.directory.localeCompare(right.directory) || left.kind.localeCompare(right.kind));
  const pages = await Promise.all(discoveredPages.map(async page => {
    const ancestors = page.directory === "" ? [""] : ["", ...page.directory.split("/").map((_, index, all) => all.slice(0, index + 1).join("/"))];
    const inheritedLayouts = ancestors
      .map(directory => layouts.find(layout => layout.directory === directory)?.file)
      .filter((file): file is string => file !== undefined);
    const nearest = (kind: DotReactBoundaryKind): string | undefined => [...ancestors].reverse()
      .map(directory => boundaries.find(boundary => boundary.kind === kind && boundary.directory === directory)?.file)
      .find((file): file is string => file !== undefined);
    const notFound = nearest("not-found");
    const error = nearest("error");
    const loading = nearest("loading");
    const inheritedLayoutFiles = inheritedLayouts;
    return {
      moduleId: page.moduleId,
      file: page.file,
      layouts: inheritedLayoutFiles,
      hydrate: await routeRequiresHydration(canonicalRoot, [page.file, ...inheritedLayoutFiles]),
      boundaries: {
        ...(notFound === undefined ? {} : { notFound }),
        ...(error === undefined ? {} : { error }),
        ...(loading === undefined ? {} : { loading })
      }
    };
  }));
  pages.sort((left, right) => left.moduleId.localeCompare(right.moduleId));

  return {
    root: canonicalRoot,
    pagesRoot: canonicalPagesRoot,
    pages,
    layouts,
    boundaries,
    ...(globalError === undefined ? {} : { globalError })
  };
}

export async function scanDotReactPages(root: string, pagesDir = "app"): Promise<readonly DotReactPage[]> {
  return (await scanDotReactGraph(root, pagesDir)).pages;
}
