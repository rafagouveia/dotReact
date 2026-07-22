import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const segmentPattern = /^(?:[a-zA-Z][a-zA-Z0-9_-]*|\[(?:\.\.\.)?[a-zA-Z][a-zA-Z0-9_]*\]|\([a-zA-Z_][a-zA-Z0-9_]*\))$/;
const typePattern = /^[A-Z][a-zA-Z0-9]*$/;

export type ScaffoldKind = "page" | "layout" | "action" | "boundary" | "component";

export interface AddOptions {
  boundaryKind?: "error" | "not-found" | "loading" | "global-error";
  dryRun?: boolean;
  route?: string;
}

interface FilePlan { path: string; content: string }

export async function addArtifact(
  root: string,
  kind: ScaffoldKind,
  rawName: string | undefined,
  options: AddOptions = {}
): Promise<string[]> {
  if (kind === "action") return addAction(root, rawName, options.route, options.dryRun === true);
  if (kind === "component") return addComponent(root, rawName, options.route, options.dryRun === true);
  if (kind === "boundary" && options.boundaryKind === "global-error")
    return addGlobalError(root, options.dryRun === true);
  const route = normalizeRoute(rawName);
  if (kind === "page") return addPage(root, route, options.dryRun === true);
  if (kind === "layout") return addLayout(root, route, options.dryRun === true);
  return addBoundary(
    root,
    route,
    options.boundaryKind === "global-error" ? undefined : options.boundaryKind,
    options.dryRun === true);
}

function normalizeRoute(value: string | undefined): string {
  if (value === undefined) throw new Error("A route is required.");
  if (value.includes("\\") || value.startsWith("//") || /[\u0000-\u001f:]/.test(value))
    throw new Error("Route must be a portable project-relative path using forward slashes.");
  const route = value.trim().replace(/^\/+|\/+$/g, "");
  if (route === "" || route === ".") return "";
  const segments = route.split("/");
  if (segments.some(segment => !segmentPattern.test(segment)))
    throw new Error("Routes may contain names, [parameter], [...catchAll] and (routeGroup) segments only.");
  return segments.join("/");
}

async function addPage(root: string, route: string, dryRun: boolean): Promise<string[]> {
  const segments = routeSegments(route);
  const stem = pageStem(segments);
  const props = `${stem}PageProps`;
  const loader = `${stem}Page`;
  const frontend = resolve(root, "app", ...segments, "page.drx");
  const backend = resolve(root, "app", ...segments, "page.server.cs");
  const contractsImport = `${"../".repeat(segments.length + 1)}src/contracts`;
  const dynamic = segments.filter(segment => segment.startsWith("[") && !segment.startsWith("[..."))
    .map(segment => segment.slice(1, -1));
  const routeValues = dynamic.map(name => `        var ${name} = context.GetRouteValue<string>("${name}");`).join("\n");
  const message = dynamic.length === 0
    ? `"Rendered by ${loader} in C#"`
    : `$"Rendered by ${loader} in C# (${dynamic.map(name => `${name}={${name}}`).join(", ")})"`;
  const namespace = ["DotReact", "App", "Routes", ...segments.map(namespaceSegment)].join(".");

  return applyPlans([
    { path: frontend, content: `import type { ${props} } from "${contractsImport}";\n\nexport const metadata = { title: "${stem} · DotReact" };\n\nexport default function ${stem}PageView(props: ${props}) {\n  return (\n    <main>\n      <h1>${stem}</h1>\n      <p>{props.message}</p>\n    </main>\n  );\n}\n` },
    { path: backend, content: `using DotReact.AspNetCore;\n\nnamespace ${namespace};\n\npublic sealed record ${props}(string Message);\n\n// The app router derives this page's route from the co-located file path.\npublic sealed class ${loader} : IDotReactPage<${props}>\n{\n    public ValueTask<${props}> LoadAsync(\n        DotReactPageContext context,\n        CancellationToken cancellationToken)\n    {\n${routeValues === "" ? "" : `${routeValues}\n`}        return ValueTask.FromResult(new ${props}(${message}));\n    }\n}\n` }
  ], dryRun);
}

async function addLayout(root: string, route: string, dryRun: boolean): Promise<string[]> {
  const segments = routeSegments(route);
  const file = resolve(root, "app", ...segments, "layout.drx");
  return applyPlans([{ path: file, content: `import type { ReactNode } from "react";\n\nexport default function Layout({ children }: { children: ReactNode }) {\n  return <section data-dotreact-layout="${route || "root"}">{children}</section>;\n}\n` }], dryRun);
}

async function addBoundary(
  root: string,
  route: string,
  kind: "error" | "not-found" | "loading" | undefined,
  dryRun: boolean
): Promise<string[]> {
  if (kind === undefined) throw new Error("Use --kind error, not-found or loading.");
  const segments = routeSegments(route);
  const file = resolve(root, "app", ...segments, `${kind}.drx`);
  if (kind === "loading") {
    return applyPlans([{ path: file, content: `export default function Loading() {\n  return (\n    <main aria-busy="true" aria-live="polite">\n      <p>Loading…</p>\n    </main>\n  );\n}\n` }], dryRun);
  }
  const title = kind === "error" ? "Something went wrong" : "Page not found";
  return applyPlans([{ path: file, content: `interface BoundaryProps {\n  statusCode: number;\n  requestId: string;\n  message?: string;\n}\n\nexport default function Boundary(props: BoundaryProps) {\n  return (\n    <main>\n      <h1>${title}</h1>\n      <p>{props.message ?? \`Request failed with status \${props.statusCode}.\`}</p>\n      <small>Request: {props.requestId}</small>\n    </main>\n  );\n}\n` }], dryRun);
}

async function addGlobalError(root: string, dryRun: boolean): Promise<string[]> {
  const file = resolve(root, "app", "global-error.drx");
  return applyPlans([{ path: file, content: `import type { DotReactGlobalErrorProps } from "@blackredsolutionsteam/dotreact-client/errors";

export default function GlobalError({ reset }: DotReactGlobalErrorProps) {
  return (
    <main>
      <h1>Something went wrong</h1>
      <p>The application could not complete this render.</p>
      <button type="button" onClick={reset}>Try again</button>
    </main>
  );
}
` }], dryRun);
}

async function addAction(
  root: string,
  rawName: string | undefined,
  rawRoute: string | undefined,
  dryRun: boolean
): Promise<string[]> {
  if (!rawName || !typePattern.test(rawName))
    throw new Error("Action names must be PascalCase identifiers.");
  const name = rawName.endsWith("Action") ? rawName.slice(0, -6) : rawName;
  if (name === "") throw new Error("Action name cannot be empty.");
  const id = name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
  const route = normalizeOptionalRoute(rawRoute);
  const segments = routeSegments(route);
  const file = resolve(root, "app", ...segments, "_actions", `${name}Action.server.cs`);
  const namespace = ["DotReact", "App", ...segments.map(namespaceSegment), "Actions"].join(".");
  return applyPlans([{ path: file, content: `using DotReact.AspNetCore;\n\nnamespace ${namespace};\n\npublic sealed record ${name}Request(string Value);\npublic sealed record ${name}Response(string Value);\n\n// Server Actions are thin presentation adapters. Invoke an Application use case\n// here; keep domain rules and persistence out of this class.\n// Authorization is required by default. Add [Authorize(Policy = "...")] for a capability policy.\n[DotReactAction("${id}")]\npublic sealed class ${name}Action : IDotReactAction<${name}Request, ${name}Response>\n{\n    public ValueTask<DotReactActionResult<${name}Response>> ExecuteAsync(\n        ${name}Request request,\n        CancellationToken cancellationToken)\n    {\n        if (string.IsNullOrWhiteSpace(request.Value))\n            return ValueTask.FromResult(DotReactActionResult<${name}Response>.Validation(\n                new Dictionary<string, string[]> { ["value"] = ["Value is required."] }));\n\n        return ValueTask.FromResult(DotReactActionResult<${name}Response>.Success(\n            new ${name}Response(request.Value.Trim())));\n    }\n}\n` }], dryRun);
}

async function addComponent(
  root: string,
  rawName: string | undefined,
  rawRoute: string | undefined,
  dryRun: boolean
): Promise<string[]> {
  if (!rawName || !typePattern.test(rawName))
    throw new Error("Component names must be PascalCase identifiers.");
  const route = normalizeOptionalRoute(rawRoute);
  const file = resolve(root, "app", ...routeSegments(route), "_components", `${rawName}.tsx`);
  return applyPlans([{ path: file, content: `import type { ReactNode } from "react";\n\nexport interface ${rawName}Props {\n  readonly children?: ReactNode;\n}\n\nexport function ${rawName}({ children }: ${rawName}Props) {\n  return <div data-component="${rawName}">{children}</div>;\n}\n` }], dryRun);
}

function normalizeOptionalRoute(value: string | undefined): string {
  return value === undefined ? "" : normalizeRoute(value);
}

async function applyPlans(plans: FilePlan[], dryRun: boolean): Promise<string[]> {
  for (const plan of plans) {
    try {
      await access(plan.path);
      throw new Error(`Refusing to overwrite existing file: ${plan.path}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  if (dryRun) return plans.map(plan => plan.path);
  const created: string[] = [];
  try {
    for (const plan of plans) {
      await mkdir(resolve(plan.path, ".."), { recursive: true });
      await writeFile(plan.path, plan.content, { encoding: "utf8", flag: "wx" });
      created.push(plan.path);
    }
  } catch (error) {
    for (const path of created) await rm(path, { force: true });
    throw error;
  }
  return plans.map(plan => plan.path);
}

function routeSegments(route: string): string[] {
  return route === "" ? [] : route.split("/");
}

function pageStem(segments: string[]): string {
  if (segments.length === 0) return "Home";
  return segments.map(segment => {
    if (segment.startsWith("(")) return pascal(segment.slice(1, -1));
    if (segment.startsWith("[...")) return `By${pascal(segment.slice(4, -1))}`;
    return segment.startsWith("[") ? `By${pascal(segment.slice(1, -1))}` : pascal(segment);
  }).join("");
}

function namespaceSegment(segment: string): string {
  if (segment.startsWith("(")) return `Group${pascal(segment.slice(1, -1))}`;
  if (segment.startsWith("[...")) return `CatchAll${pascal(segment.slice(4, -1))}`;
  return segment.startsWith("[") ? `By${pascal(segment.slice(1, -1))}` : pascal(segment);
}

function pascal(value: string): string {
  return value.split(/[-_]/).filter(Boolean).map(part => part[0]!.toUpperCase() + part.slice(1)).join("");
}
