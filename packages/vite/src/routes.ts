const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
const staticSegment = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Mirrors DotReactRouteConvention.InferPattern in the ASP.NET Core package. */
export function inferDotReactRoute(moduleId: string): string {
  if (moduleId.length === 0 || moduleId.length > 512 || moduleId.includes("\\")) throw invalid(moduleId);
  const segments = moduleId.split("/");
  if (segments.at(-1) !== "page" || segments.some(segment => segment.length === 0)) throw invalid(moduleId);

  const route: string[] = [];
  const parameters = new Set<string>();
  for (const segment of segments.slice(0, -1)) {
    if (segment.startsWith("(") && segment.endsWith(")") && identifier.test(segment.slice(1, -1))) continue;
    const catchAll = segment.startsWith("[...") && segment.endsWith("]");
    const simple = segment.startsWith("[") && segment.endsWith("]") && !catchAll;
    if (simple || catchAll) {
      const name = catchAll ? segment.slice(4, -1) : segment.slice(1, -1);
      const folded = name.toLocaleLowerCase("en-US");
      if (!identifier.test(name) || parameters.has(folded)) throw invalid(moduleId);
      parameters.add(folded);
      route.push(catchAll ? `{**${name}}` : `{${name}}`);
      continue;
    }
    if (!staticSegment.test(segment) || segment === "." || segment === "..") throw invalid(moduleId);
    route.push(segment);
  }
  return route.length === 0 ? "/" : `/${route.join("/")}`;
}

function invalid(moduleId: string): Error {
  return new Error(`DotReact page module ID '${moduleId}' is not canonical. Expected 'page' or '<segments>/page'.`);
}
