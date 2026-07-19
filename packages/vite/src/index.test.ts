import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkDotReactProject, dotReact, inferDotReactRoute, scanDotReactGraph, scanDotReactPages } from "./index.js";

async function fixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dotreact-vite-"));
  await fs.mkdir(path.join(root, "src/pages/admin"), { recursive: true });
  await fs.writeFile(path.join(root, "src/pages/index.drx"), "export default () => <main />;");
  await fs.writeFile(path.join(root, "src/pages/admin/users.drx"), "export default () => <main />;");
  await fs.writeFile(path.join(root, "src/pages/ignored.tsx"), "export default null;");
  return root;
}

test("scans only DRX pages and derives portable module IDs", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const pages = await scanDotReactPages(root);
  assert.deepEqual(pages.map((page) => page.moduleId), ["admin/users", "index"]);
});

test("rejects a pages directory outside the canonical root", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await assert.rejects(scanDotReactPages(root, "../pages"), /must be contained/);
});

test("does not follow a symlink escaping the pages tree", async (context) => {
  const root = await fixture();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "dotreact-outside-"));
  context.after(() => Promise.all([fs.rm(root, { recursive: true, force: true }), fs.rm(outside, { recursive: true, force: true })]));
  await fs.writeFile(path.join(outside, "secret.drx"), "export default null;");
  try {
    await fs.symlink(outside, path.join(root, "src/pages/outside"), "junction");
  } catch (error) {
    if (["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) context.skip("symlinks are unavailable");
    else throw error;
  }
  const pages = await scanDotReactPages(root);
  assert.equal(pages.some((page) => page.moduleId.startsWith("outside/")), false);
});

test("detects duplicate canonical module IDs introduced by an internal file symlink", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  try {
    await fs.symlink(path.join(root, "src/pages/index.drx"), path.join(root, "src/pages/index-alias.drx"), "file");
  } catch (error) {
    if (["EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) context.skip("symlinks are unavailable");
    else throw error;
  }
  await assert.rejects(scanDotReactPages(root), /Duplicate DotReact moduleId/);
});

test("virtual module uses static imports and DRX is transformed as TSX", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const plugin = dotReact();
  assert.equal(typeof plugin.configResolved, "function");
  await (plugin.configResolved as (config: object) => void)({ root });
  const loaded = await (plugin.load as (id: string) => Promise<string>)("\0virtual:dotreact/pages");
  assert.match(loaded, /import \* as page0 from/);
  assert.match(loaded, /"admin\/users": page0/);
  const transformed = await (plugin.transform as (code: string, id: string) => Promise<{ code: string }>) (
    "interface Props { value: string }; export default ({ value }: Props) => <main>{value}</main>;",
    path.join(root, "src/pages/typed.drx")
  );
  assert.doesNotMatch(transformed.code, /interface Props/);
  assert.match(transformed.code, /jsx/);
});

test("composes root and nested layouts from root to leaf without registering layouts as pages", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "src/pages/layout.drx"), "export default ({ children }) => <div>{children}</div>;");
  await fs.writeFile(path.join(root, "src/pages/admin/layout.drx"), "export default ({ children }) => <section>{children}</section>;");

  const graph = await scanDotReactGraph(root);
  const admin = graph.pages.find(page => page.moduleId === "admin/users");
  assert.equal(graph.layouts.length, 2);
  assert.equal(admin?.layouts.length, 2);
  assert.equal(graph.pages.some(page => page.moduleId.endsWith("layout")), false);

  const plugin = dotReact();
  await (plugin.configResolved as (config: object) => void)({ root });
  const loaded = await (plugin.load as (id: string) => Promise<string>)("\0virtual:dotreact/pages");
  assert.match(loaded, /createElement\(Layout0, null, createElement\(Layout1, null, createElement\(page0\.default, props\)\)\)/);
});

test("fails closed when frontend pages drift from the backend manifest", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "backend.json"), JSON.stringify({
    schemaVersion: 1,
    pages: [{ moduleId: "missing/page", propsType: "Test.MissingProps" }],
    actions: []
  }));
  const plugin = dotReact({ backendManifest: "backend.json" });
  await (plugin.configResolved as (config: object) => void)({ root });
  await assert.rejects(
    (plugin.load as (id: string) => Promise<string>)("\0virtual:dotreact/pages"),
    /Backend page without \.drx: missing\/page[\s\S]*\.drx page without backend registration/
  );
});

test("route convention matches the ASP.NET Core module mapping", () => {
  assert.equal(inferDotReactRoute("page"), "/");
  assert.equal(inferDotReactRoute("products/[id]/page"), "/products/{id}");
  assert.equal(inferDotReactRoute("(shop)/products/[id]/page"), "/products/{id}");
  assert.equal(inferDotReactRoute("docs/[...slug]/page"), "/docs/{**slug}");
  assert.throws(() => inferDotReactRoute("products/[id]/[id]/page"), /not canonical/);
});

test("rejects convention route drift in a schema v2 backend manifest", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "backend.json"), JSON.stringify({
    schemaVersion: 2,
    pages: [{ moduleId: "page", propsType: "Test.IndexProps", pattern: "/wrong", routing: "convention" }],
    actions: []
  }));
  const plugin = dotReact({ backendManifest: "backend.json" });
  await (plugin.configResolved as (config: object) => void)({ root });
  await assert.rejects(
    (plugin.load as (id: string) => Promise<string>)("\0virtual:dotreact/pages"),
    /Convention route drift for page: expected \/, received \/wrong/
  );
});

test("semantic checker reports DRX type errors with the original DRX path", async (context) => {
  const root = await fs.mkdtemp(path.join(process.cwd(), ".tmp-dotreact-check-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "src/pages"), { recursive: true });
  await fs.writeFile(path.join(root, "tsconfig.json"), JSON.stringify({
    compilerOptions: { target: "ES2023", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", strict: true, noEmit: true },
    include: ["src/**/*.ts", "src/**/*.tsx"]
  }));
  await fs.writeFile(path.join(root, "src/contracts.ts"), "export interface IndexProps { message: string }\n");
  await fs.writeFile(path.join(root, "src/pages/index.drx"), [
    'import type { IndexProps } from "../contracts";',
    "export default function Page(props: IndexProps) {",
    "  return <main>{props.doesNotExist}</main>;",
    "}"
  ].join("\n"));
  await fs.writeFile(path.join(root, "backend.json"), JSON.stringify({
    schemaVersion: 1,
    pages: [{ moduleId: "index", propsType: "Test.IndexProps" }],
    actions: []
  }));

  const result = await checkDotReactProject({
    root,
    backendManifest: "backend.json",
    contracts: "src/contracts.ts"
  });
  assert.equal(result.diagnostics.some(diagnostic =>
    diagnostic.file === "src/pages/index.drx" && diagnostic.message.includes("doesNotExist")), true,
    JSON.stringify(result.diagnostics));
  assert.equal(result.diagnostics.some(diagnostic => diagnostic.file?.endsWith(".drx.tsx") === true), false);
});

test("classifies special boundaries separately and selects the nearest ancestor per kind", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "src/pages/not-found.drx"), "export default () => null;");
  await fs.writeFile(path.join(root, "src/pages/error.drx"), "export default () => null;");
  await fs.writeFile(path.join(root, "src/pages/admin/error.drx"), "export default () => null;");

  const graph = await scanDotReactGraph(root);
  assert.equal(graph.pages.some(page => /(?:not-found|error)$/.test(page.moduleId)), false);
  assert.equal(graph.boundaries.length, 3);
  const rootPage = graph.pages.find(page => page.moduleId === "index");
  const nestedPage = graph.pages.find(page => page.moduleId === "admin/users");
  assert.equal(path.basename(rootPage?.boundaries.notFound ?? ""), "not-found.drx");
  assert.equal(path.dirname(rootPage?.boundaries.error ?? ""), path.join(root, "src/pages"));
  assert.equal(path.basename(nestedPage?.boundaries.notFound ?? ""), "not-found.drx");
  assert.equal(path.dirname(nestedPage?.boundaries.error ?? ""), path.join(root, "src/pages/admin"));
});

test("virtual module exposes a separate page-keyed boundary registry", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "src/pages/not-found.drx"), "export const marker = 'root'; export default () => null;");
  await fs.writeFile(path.join(root, "src/pages/admin/error.drx"), "export const marker = 'nested'; export default () => null;");
  const plugin = dotReact();
  await (plugin.configResolved as (config: object) => void)({ root });
  const loaded = await (plugin.load as (id: string) => Promise<string>)("\0virtual:dotreact/pages");
  assert.match(loaded, /import \* as boundary\d+ from/);
  assert.match(loaded, /export const boundaries = Object\.freeze/);
  assert.match(loaded, /"admin\/users": Object\.freeze\(\{notFound: boundary\d+,error: boundary\d+\}\)/);
  assert.match(loaded, /"index": Object\.freeze\(\{notFound: boundary\d+\}\)/);
});

test("semantic checker enforces safe optional framework boundary props", async (context) => {
  const root = await fs.mkdtemp(path.join(process.cwd(), ".tmp-dotreact-boundary-check-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "src/pages"), { recursive: true });
  await fs.writeFile(path.join(root, "tsconfig.json"), JSON.stringify({
    compilerOptions: { target: "ES2023", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", strict: true, noEmit: true },
    include: ["src/**/*.ts", "src/**/*.tsx"]
  }));
  await fs.writeFile(path.join(root, "src/pages/page.drx"), "export default function Page() { return null; }");
  await fs.writeFile(path.join(root, "src/pages/error.drx"), [
    "interface UnsafeProps { statusCode: number; requestId: string; message: string }",
    "export default function ErrorBoundary(props: UnsafeProps) { return null; }"
  ].join("\n"));
  const result = await checkDotReactProject({ root });
  assert.equal(result.boundaryCount, 1);
  assert.equal(result.diagnostics.some(diagnostic =>
    diagnostic.message.includes("DotReactBoundaryProps") || diagnostic.message.includes("message")), true,
    JSON.stringify(result.diagnostics));
});

test("boundary changes invalidate and return the virtual registry module for HMR", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const boundary = path.join(root, "src/pages/error.drx");
  await fs.writeFile(boundary, "export default () => null;");
  const plugin = dotReact();
  await (plugin.configResolved as (config: object) => void)({ root });
  const virtualModule = { id: "\0virtual:dotreact/pages" };
  const result = await (plugin.handleHotUpdate as (context: object) => Promise<unknown>)({
    file: boundary,
    server: { moduleGraph: { getModuleById: () => virtualModule } }
  });
  assert.deepEqual(result, [virtualModule]);
});
