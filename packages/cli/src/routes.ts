import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const moduleIdPattern = /^[A-Za-z0-9_.()\[\]-]+(?:\/[A-Za-z0-9_.()\[\]-]+)*$/;

interface RouteDiagnostic {
  readonly pattern: string;
  readonly moduleId: string;
  readonly routing: string;
  readonly prerenderPaths: readonly string[];
  readonly revalidateSeconds?: number;
}

export interface RouteDiagnosticReport {
  readonly routes: readonly RouteDiagnostic[];
  readonly actionCount: number;
  readonly runtimeInspected: boolean;
}

export async function inspectRoutes(root: string, runtimeUrl?: string): Promise<RouteDiagnosticReport> {
  const manifestPath = resolve(root, "src/backend-manifest.json");
  const source = await readFile(manifestPath, "utf8");
  if (Buffer.byteLength(source) > 1024 * 1024) throw new Error("Backend manifest exceeds 1048576 bytes.");
  const manifest = parseBackendManifest(JSON.parse(source));
  const prerender = runtimeUrl === undefined ? [] : await readPrerenderManifest(runtimeUrl);
  const prerenderByModule = new Map<string, typeof prerender>();
  for (const route of prerender) {
    const current = prerenderByModule.get(route.moduleId);
    if (current === undefined) prerenderByModule.set(route.moduleId, [route]);
    else current.push(route);
  }
  return {
    routes: manifest.pages.map(page => {
      const staticPaths = prerenderByModule.get(page.moduleId) ?? [];
      const revalidate = staticPaths.map(path => path.revalidateSeconds)
        .filter((value): value is number => value !== undefined);
      return {
        ...page,
        prerenderPaths: staticPaths.map(path => path.path).sort(),
        ...(revalidate.length === 0 ? {} : { revalidateSeconds: Math.min(...revalidate) })
      };
    }),
    actionCount: manifest.actions.length,
    runtimeInspected: runtimeUrl !== undefined
  };
}

export function formatRouteDiagnostics(report: RouteDiagnosticReport): string {
  const rows = report.routes.map(route => {
    const mode = route.prerenderPaths.length === 0
      ? "dynamic SSR"
      : route.revalidateSeconds === undefined || route.revalidateSeconds === 0
        ? `static (${route.prerenderPaths.length} path${route.prerenderPaths.length === 1 ? "" : "s"})`
        : `ISR ${route.revalidateSeconds}s (${route.prerenderPaths.length} path${route.prerenderPaths.length === 1 ? "" : "s"})`;
    return `  ${route.prerenderPaths.length === 0 ? "○" : "●"} ${route.pattern.padEnd(28)} ${mode.padEnd(24)} ${route.moduleId}`;
  });
  return [
    "DotReact routes",
    ...rows,
    `  ${report.routes.length} page(s) · ${report.actionCount} Server Action(s)`,
    report.runtimeInspected
      ? "  ● prerender/ISR discovered from the running host · ○ dynamic SSR"
      : "  Runtime not inspected; use --url to distinguish prerender/ISR from dynamic SSR.",
    "  Every DRX page SSRs; production hydrates only routes that require browser behavior."
  ].join("\n");
}

function parseBackendManifest(value: unknown): {
  pages: Array<{ pattern: string; moduleId: string; routing: string }>;
  actions: unknown[];
} {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid backend manifest.");
  const record = value as Record<string, unknown>;
  if ((record.schemaVersion !== 1 && record.schemaVersion !== 2) || !Array.isArray(record.pages))
    throw new Error("Unsupported backend manifest schema.");
  const pages = record.pages.map((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry))
      throw new Error(`Invalid backend page at index ${index}.`);
    const page = entry as Record<string, unknown>;
    if (typeof page.moduleId !== "string" || !moduleIdPattern.test(page.moduleId))
      throw new Error(`Invalid backend module ID at index ${index}.`);
    if (typeof page.pattern !== "string" || !page.pattern.startsWith("/") || page.pattern.length > 2048)
      throw new Error(`Invalid backend route pattern at index ${index}.`);
    return { pattern: page.pattern, moduleId: page.moduleId, routing: String(page.routing ?? "explicit") };
  });
  return { pages, actions: Array.isArray(record.actions) ? record.actions : [] };
}

async function readPrerenderManifest(runtimeUrl: string): Promise<Array<{
  path: string;
  moduleId: string;
  revalidateSeconds?: number;
}>> {
  const base = new URL(runtimeUrl);
  if (!['http:', 'https:'].includes(base.protocol) || base.username !== "" || base.password !== "")
    throw new Error("--url must be an HTTP(S) origin without credentials.");
  const response = await fetch(new URL("/_dotreact/prerender-manifest", base), {
    redirect: "error",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000)
  });
  if (!response.ok) throw new Error(`Prerender manifest failed with HTTP ${response.status}.`);
  const value: unknown = await response.json();
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid prerender manifest.");
  const routes = (value as Record<string, unknown>).routes;
  if (!Array.isArray(routes) || routes.length > 100_000) throw new Error("Invalid prerender manifest routes.");
  return routes.map((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry))
      throw new Error(`Invalid prerender route at index ${index}.`);
    const route = entry as Record<string, unknown>;
    if (typeof route.path !== "string" || !route.path.startsWith("/") || typeof route.moduleId !== "string"
      || !moduleIdPattern.test(route.moduleId)) throw new Error(`Invalid prerender route at index ${index}.`);
    return {
      path: route.path,
      moduleId: route.moduleId,
      ...(typeof route.revalidateSeconds === "number" ? { revalidateSeconds: route.revalidateSeconds } : {})
    };
  });
}
