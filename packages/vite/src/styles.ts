import { promises as fs } from "node:fs";
import path from "node:path";
import type { DotReactGraph } from "./discovery.js";

const maxTraversedModules = 2_048;
const maxSourceBytes = 2 * 1024 * 1024;
const sourceExtension = /\.(?:[cm]?[jt]sx?|drx)$/i;
const styleExtension = /\.css$/i;
const staticImport = /\b(?:import|export)\s+(?:[^"'`;]*?\s+from\s+)?["']([^"']+)["']/g;
const dynamicImport = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

export const dotReactRouteStylePath = "__dotreact_route_style.css";

export interface DotReactResolvedImport {
  readonly id: string;
  readonly external?: boolean;
}

export type DotReactImportResolver = (
  specifier: string,
  importer: string
) => Promise<DotReactResolvedImport | null | undefined>;

/** Resolves local source imports without invoking the browser dependency optimizer. */
export async function resolveDotReactLocalImport(
  root: string,
  specifier: string,
  importer: string
): Promise<DotReactResolvedImport | null> {
  const clean = specifier.split(/[?#]/, 1)[0] ?? "";
  if (!clean.startsWith(".") && !clean.startsWith("/")) return null;
  const requested = clean.startsWith("/")
    ? path.resolve(root, `.${clean}`)
    : path.resolve(path.dirname(importer), clean);
  const candidates = path.extname(requested).length > 0
    ? [requested]
    : [requested, ...[".ts", ".tsx", ".js", ".jsx", ".drx", ".css"].map(extension => `${requested}${extension}`),
      ...[".ts", ".tsx", ".js", ".jsx", ".drx", ".css"].map(extension => path.join(requested, `index${extension}`))];
  for (const candidate of candidates) {
    try {
      const canonical = await fs.realpath(candidate);
      const relative = path.relative(root, canonical);
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
      if ((await fs.stat(canonical)).isFile()) return { id: canonical };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return null;
}

function cleanFileId(id: string): string | undefined {
  if (id.startsWith("\0") || id.startsWith("virtual:")) return undefined;
  const clean = id.split(/[?#]/, 1)[0];
  if (clean === undefined || clean.length === 0) return undefined;
  return path.resolve(clean);
}

function importsFrom(source: string): readonly string[] {
  const imports: string[] = [];
  for (const expression of [staticImport, dynamicImport]) {
    expression.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = expression.exec(source)) !== null) {
      if (match[1] !== undefined) imports.push(match[1]);
    }
  }
  return imports;
}

/**
 * Finds CSS reachable from one route before the hydrated module graph executes.
 * The result preserves import order so the browser observes the same cascade.
 */
export async function collectDotReactRouteStyles(
  graph: DotReactGraph,
  moduleId: string,
  resolveImport: DotReactImportResolver
): Promise<readonly string[]> {
  const page = graph.pages.find(candidate => candidate.moduleId === moduleId);
  if (page === undefined) return [];

  const visited = new Set<string>();
  const styles = new Set<string>();

  const visit = async (file: string): Promise<void> => {
    const canonical = path.resolve(file);
    if (visited.has(canonical)) return;
    visited.add(canonical);
    if (visited.size > maxTraversedModules)
      throw new Error(`DotReact route style graph exceeds ${maxTraversedModules} modules for ${moduleId}.`);

    let stat;
    try {
      stat = await fs.stat(canonical);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    if (!stat.isFile()) return;
    if (styleExtension.test(canonical)) {
      styles.add(canonical);
      return;
    }
    if (!sourceExtension.test(canonical) || stat.size > maxSourceBytes) return;

    const source = await fs.readFile(canonical, "utf8");
    for (const specifier of importsFrom(source)) {
      const resolved = await resolveImport(specifier, canonical);
      if (resolved?.external === true) continue;
      const dependency = resolved === null || resolved === undefined
        ? undefined
        : cleanFileId(resolved.id);
      if (dependency !== undefined) await visit(dependency);
    }
  };

  for (const layout of page.layouts) await visit(layout);
  await visit(page.file);
  for (const boundary of [page.boundaries.notFound, page.boundaries.error, page.boundaries.loading]) {
    if (boundary !== undefined) await visit(boundary);
  }
  return [...styles];
}

export function createDotReactRouteStyleSheet(
  root: string,
  base: string,
  styleFiles: readonly string[]
): string {
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return styleFiles.map(file => {
    const relative = path.relative(root, file);
    const contained = relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
    const assetPath = contained
      ? relative.replaceAll("\\", "/")
      : `@fs/${file.replaceAll("\\", "/")}`;
    return `@import url(${JSON.stringify(`${normalizedBase}${assetPath}`)});`;
  }).join("\n");
}

/**
 * Composes the blocking development stylesheet without violating CSS import
 * ordering. CSS requires every @import to precede ordinary at-rules and style
 * rules; otherwise browsers ignore the route imports and paint unstyled HTML
 * until the hydrated module graph loads them.
 */
export function createDotReactDevelopmentStyleSheet(
  root: string,
  base: string,
  styleFiles: readonly string[],
  frameworkCss: string
): string {
  const routeCss = createDotReactRouteStyleSheet(root, base, styleFiles);
  if (routeCss.length === 0) return frameworkCss;
  if (frameworkCss.length === 0) return routeCss;
  return `${routeCss}\n${frameworkCss}`;
}
