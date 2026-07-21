import { promises as fs } from "node:fs";
import path from "node:path";

const sourceExtensions = [".drx", ".tsx", ".ts", ".jsx", ".js"] as const;
const safeBareImports = new Set([
  "react",
  "react/jsx-runtime",
  "@dotreact/client/router",
  "@dotreact/font",
  "@dotreact/image"
]);
const clientHooks = new Set([
  "useActionState", "useCallback", "useContext", "useDebugValue", "useDeferredValue",
  "useEffect", "useEffectEvent", "useImperativeHandle", "useInsertionEffect", "useLayoutEffect",
  "useMemo", "useOptimistic", "useReducer", "useRef", "useState", "useSyncExternalStore",
  "useTransition"
]);
const browserGlobals = new Set([
  "document", "history", "localStorage", "location", "matchMedia", "navigator",
  "sessionStorage", "window"
]);

function isContained(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

/**
 * Proves that a route can be served as server-only HTML. Any unknown package,
 * unresolved local import or browser capability fails closed to hydration.
 */
export async function routeRequiresHydration(
  projectRoot: string,
  entries: readonly string[]
): Promise<boolean> {
  const canonicalRoot = await fs.realpath(projectRoot);
  const visited = new Set<string>();

  const inspect = async (file: string): Promise<boolean> => {
    let canonicalFile: string;
    try { canonicalFile = await fs.realpath(file); }
    catch { return true; }
    if (!isContained(canonicalRoot, canonicalFile) || visited.has(canonicalFile))
      return !isContained(canonicalRoot, canonicalFile);
    visited.add(canonicalFile);
    if (visited.size > 10_000) return true;

    const source = await fs.readFile(canonicalFile, "utf8");
    if (Buffer.byteLength(source) > 4 * 1024 * 1024) return true;
    if (/^\s*["']use client["'];?/mu.test(source)) return true;
    const imports: Array<{ specifier: string; typeOnly: boolean }> = [];
    const importPattern = /(?:^|[;\n])\s*(import|export)\s+(type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/gmu;
    for (const match of source.matchAll(importPattern))
      imports.push({ specifier: match[3]!, typeOnly: match[2] !== undefined });
    if (/\bon[A-Z][A-Za-z0-9]*\s*=/.test(source)) return true;
    if ([...clientHooks].some(hook => new RegExp(`\\b${hook}\\s*\\(`).test(source))) return true;
    if (/\b(?:useDotReactHydrated|useDotReactRouter|DotReactClientOnly)\b/.test(source)) return true;
    if ([...browserGlobals].some(value => new RegExp(`\\b${value}\\b`).test(source))) return true;

    for (const dependency of imports) {
      if (dependency.typeOnly || dependency.specifier.endsWith(".css")) continue;
      if (!dependency.specifier.startsWith(".") && !dependency.specifier.startsWith("/")) {
        if (!safeBareImports.has(dependency.specifier)) return true;
        continue;
      }
      const resolved = await resolveLocalImport(canonicalRoot, canonicalFile, dependency.specifier);
      if (resolved === undefined || await inspect(resolved)) return true;
    }
    return false;
  };

  for (const entry of entries) if (await inspect(entry)) return true;
  return false;
}

async function resolveLocalImport(root: string, importer: string, specifier: string): Promise<string | undefined> {
  const candidate = specifier.startsWith("/") ? path.resolve(root, `.${specifier}`)
    : path.resolve(path.dirname(importer), specifier);
  if (!isContained(root, candidate)) return undefined;
  const possibilities = [candidate, ...sourceExtensions.map(extension => `${candidate}${extension}`),
    ...sourceExtensions.map(extension => path.join(candidate, `index${extension}`))];
  for (const possibility of possibilities) {
    try {
      if ((await fs.stat(possibility)).isFile()) return possibility;
    } catch { /* continue */ }
  }
  return undefined;
}
