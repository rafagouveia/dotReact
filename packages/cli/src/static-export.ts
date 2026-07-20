export interface PrerenderManifestRoute {
  readonly path: string;
  readonly moduleId: string;
  readonly revalidateSeconds: number | null;
  readonly tags: readonly string[];
}

export interface PrerenderManifest {
  readonly version: 1;
  readonly buildId: string;
  readonly routes: readonly PrerenderManifestRoute[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateStaticRoutes(values: readonly unknown[]): string[] {
  const routes = [...new Set(values.map(value => typeof value === "string" ? value.trim() : ""))];
  if (routes.length === 0 || routes.some(route => !route.startsWith("/") || route.startsWith("//")
    || route.includes("?") || route.includes("#") || route.includes("\\")
    || /[\u0000-\u001f]/u.test(route))) {
    throw new Error("Static export routes must be canonical local paths without query strings.");
  }
  return routes;
}

export function parsePrerenderManifest(value: unknown): PrerenderManifest {
  if (!isObject(value) || value.version !== 1 || typeof value.buildId !== "string"
    || !Array.isArray(value.routes)) {
    throw new Error("The server returned an invalid DotReact prerender manifest.");
  }
  const routes = value.routes.map((candidate): PrerenderManifestRoute => {
    if (!isObject(candidate) || typeof candidate.path !== "string"
      || typeof candidate.moduleId !== "string"
      || !(candidate.revalidateSeconds === null || typeof candidate.revalidateSeconds === "number")
      || !Array.isArray(candidate.tags) || candidate.tags.some(tag => typeof tag !== "string")) {
      throw new Error("The server returned an invalid DotReact prerender manifest route.");
    }
    return {
      path: candidate.path,
      moduleId: candidate.moduleId,
      revalidateSeconds: candidate.revalidateSeconds,
      tags: candidate.tags as string[]
    };
  });
  validateStaticRoutes(routes.map(route => route.path));
  return { version: 1, buildId: value.buildId, routes };
}
