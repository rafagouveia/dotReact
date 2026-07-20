import { promises as fs } from "node:fs";
import path from "node:path";
import type { DotReactPage } from "./discovery.js";
import { inferDotReactRoute } from "./routes.js";

const maxManifestBytes = 1024 * 1024;
const moduleIdPattern = /^[A-Za-z0-9_.()\[\]-]+(?:\/[A-Za-z0-9_.()\[\]-]+)*$/;

export interface BackendPage {
  readonly moduleId: string;
  readonly propsType: string;
  readonly pattern?: string;
  readonly routing?: "explicit" | "convention" | "app";
}

export interface BackendManifest {
  readonly schemaVersion: 1 | 2;
  readonly pages: readonly BackendPage[];
}

export async function readBackendManifest(root: string, manifestPath: string): Promise<BackendManifest> {
  const canonicalRoot = await fs.realpath(root);
  const candidate = path.resolve(canonicalRoot, manifestPath);
  const relative = path.relative(canonicalRoot, candidate);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`DotReact backend manifest must be inside the project root: ${manifestPath}`);
  }
  const stat = await fs.stat(candidate);
  if (stat.size > maxManifestBytes) throw new Error(`DotReact backend manifest exceeds ${maxManifestBytes} bytes.`);
  const value = JSON.parse(await fs.readFile(candidate, "utf8")) as unknown;
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Invalid DotReact backend manifest object.");
  const record = value as Record<string, unknown>;
  if ((record.schemaVersion !== 1 && record.schemaVersion !== 2) || !Array.isArray(record.pages)) throw new Error("Unsupported DotReact backend manifest schema.");
  if (record.pages.length > 10_000) throw new Error("DotReact backend manifest contains too many pages.");
  const pages = record.pages.map((entry, index): BackendPage => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) throw new Error(`Invalid backend page at index ${index}.`);
    const page = entry as Record<string, unknown>;
    if (typeof page.moduleId !== "string" || !moduleIdPattern.test(page.moduleId)) throw new Error(`Invalid backend moduleId at index ${index}.`);
    if (typeof page.propsType !== "string" || page.propsType.length === 0 || page.propsType.length > 512) throw new Error(`Invalid backend propsType at index ${index}.`);
    const pattern = typeof page.pattern === "string" ? page.pattern : undefined;
    const routing = page.routing === "explicit" || page.routing === "convention" || page.routing === "app"
      ? page.routing : undefined;
    if (record.schemaVersion === 2 && (pattern === undefined || routing === undefined))
      throw new Error(`Backend manifest page at index ${index} requires pattern and routing.`);
    if (routing === "convention" || routing === "app") {
      const expected = inferDotReactRoute(page.moduleId);
      if (pattern !== expected) throw new Error(`Convention route drift for ${page.moduleId}: expected ${expected}, received ${pattern ?? "missing"}.`);
    }
    return {
      moduleId: page.moduleId,
      propsType: page.propsType,
      ...(pattern === undefined ? {} : { pattern }),
      ...(routing === undefined ? {} : { routing })
    };
  });
  const seen = new Map<string, string>();
  for (const page of pages) {
    const folded = page.moduleId.toLowerCase();
    const previous = seen.get(folded);
    if (previous !== undefined) throw new Error(`Duplicate backend moduleId: ${previous}`);
    seen.set(folded, page.moduleId);
  }
  return { schemaVersion: record.schemaVersion, pages };
}

export function validateBackendPages(frontendPages: readonly DotReactPage[], manifest: BackendManifest): void {
  const frontend = new Set(frontendPages.map(page => page.moduleId));
  const backend = new Set(manifest.pages.map(page => page.moduleId));
  const backendOnly = [...backend].filter(moduleId => !frontend.has(moduleId)).sort();
  const frontendOnly = [...frontend].filter(moduleId => !backend.has(moduleId)).sort();
  const errors = [
    ...backendOnly.map(moduleId => `Backend page without .drx: ${moduleId}`),
    ...frontendOnly.map(moduleId => `.drx page without backend registration: ${moduleId}`)
  ];
  if (errors.length > 0) throw new Error(errors.join("\n"));
}
