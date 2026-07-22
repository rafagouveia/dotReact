import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { localFont } from "@blackredsolutionsteam/dotreact-font";
import { checkDotReactProject, collectDotReactRouteStyles, createDotReactDevelopmentStyleSheet, createDotReactRouteAssetManifest, createDotReactRouteStyleSheet, defineDotReactConfig, dotReact, inferDotReactRoute, resolveDotReactDiagnosticFile, scanDotReactGraph, scanDotReactPages } from "./index.js";

async function fixture(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dotreact-vite-"));
  await fs.mkdir(path.join(root, "src/pages/admin"), { recursive: true });
  await fs.writeFile(path.join(root, "src/pages/index.drx"), "export default () => <main />;");
  await fs.writeFile(path.join(root, "src/pages/admin/users.drx"), "export default () => <main />;");
  await fs.writeFile(path.join(root, "src/pages/ignored.tsx"), "export default null;");
  return root;
}

test("convention config keeps entries, manifests and chunk policy framework-owned", async () => {
  const exported = defineDotReactConfig();
  assert.equal(typeof exported, "function");
  const config = await (exported as (environment: object) => Promise<Record<string, unknown>> | Record<string, unknown>)({
    command: "build", mode: "production", isSsrBuild: false, isPreview: false
  });
  const build = config.build as { manifest?: boolean; cssCodeSplit?: boolean; rollupOptions?: { input?: string; output?: { assetFileNames?: string } } };
  assert.equal(build.manifest, true);
  assert.equal(build.cssCodeSplit, undefined);
  assert.equal(build.rollupOptions?.input, "virtual:dotreact/client-entry");
  assert.equal(build.rollupOptions?.output?.assetFileNames, "_dotreact/[name]-[hash][extname]");
});

test("scans only DRX pages and derives portable module IDs", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const pages = await scanDotReactPages(root, "src/pages");
  assert.deepEqual(pages.map((page) => page.moduleId), ["admin/users", "index"]);
});

test("app router discovers only page files, preserves route groups and ignores private folders", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dotreact-app-router-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "app/(operations)/customers/[id]"), { recursive: true });
  await fs.mkdir(path.join(root, "app/_components"), { recursive: true });
  await fs.writeFile(path.join(root, "app/page.drx"), "export default () => <main />;");
  await fs.writeFile(path.join(root, "app/(operations)/layout.drx"), "export default ({ children }) => <>{children}</>;");
  await fs.writeFile(path.join(root, "app/(operations)/customers/[id]/page.drx"), "export default () => <main />;");
  await fs.writeFile(path.join(root, "app/(operations)/customers/[id]/Card.drx"), "export default () => <aside />;");
  await fs.writeFile(path.join(root, "app/_components/page.drx"), "export default () => <main />;");

  const graph = await scanDotReactGraph(root, "app");

  assert.deepEqual(graph.pages.map(page => page.moduleId), ["(operations)/customers/[id]/page", "page"]);
  assert.equal(graph.layouts.length, 1);
  assert.equal(graph.pages[0]?.layouts.length, 1);
  assert.equal(graph.pages.some(page => page.moduleId.includes("_components") || page.moduleId.includes("Card")), false);
  assert.equal(inferDotReactRoute(graph.pages[0]!.moduleId), "/customers/{id}");
});

test("collects modular route CSS in blocking cascade order", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dotreact-route-css-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "app/dashboard"), { recursive: true });
  await fs.mkdir(path.join(root, "src/features"), { recursive: true });
  await fs.writeFile(path.join(root, "app/layout.drx"), 'import "../src/layout.css"; export default ({ children }) => children;');
  await fs.writeFile(path.join(root, "app/dashboard/page.drx"), 'import Panel from "../../src/features/Panel.tsx"; export default () => <Panel />;');
  await fs.writeFile(path.join(root, "app/dashboard/error.drx"), 'import "../../src/error.css"; export default () => null;');
  await fs.writeFile(path.join(root, "src/features/Panel.tsx"), 'import "./panel.css"; export default () => <main />;');
  await fs.writeFile(path.join(root, "src/layout.css"), ":root { color: black; }");
  await fs.writeFile(path.join(root, "src/features/panel.css"), ".panel { display: grid; }");
  await fs.writeFile(path.join(root, "src/error.css"), ".error { color: red; }");

  const graph = await scanDotReactGraph(root, "app");
  const styles = await collectDotReactRouteStyles(graph, "dashboard/page", async (specifier, importer) => ({
    id: path.resolve(path.dirname(importer), specifier)
  }));

  assert.deepEqual(styles.map(file => path.relative(root, file).replaceAll("\\", "/")), [
    "src/layout.css",
    "src/features/panel.css",
    "src/error.css"
  ]);
  assert.equal(createDotReactRouteStyleSheet(root, "/_dotreact/dev/", styles), [
    '@import url("/_dotreact/dev/src/layout.css");',
    '@import url("/_dotreact/dev/src/features/panel.css");',
    '@import url("/_dotreact/dev/src/error.css");'
  ].join("\n"));

  const blockingCss = createDotReactDevelopmentStyleSheet(
    root,
    "/_dotreact/dev/",
    styles,
    '@font-face { font-family: "Example"; src: url("/example.woff2"); }'
  );
  assert.ok(blockingCss.indexOf("@import") < blockingCss.indexOf("@font-face"));
  assert.doesNotMatch(blockingCss, /@font-face[^]*@import/u);
});

test("rejects a pages directory outside the canonical root", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await assert.rejects(scanDotReactPages(root, "../pages"), /must be contained/);
});

test("development diagnostics resolve project files and reject traversal", async (context) => {
  const root = await fixture();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "dotreact-diagnostic-outside-"));
  context.after(() => Promise.all([fs.rm(root, { recursive: true, force: true }), fs.rm(outside, { recursive: true, force: true })]));
  const page = path.join(root, "src/pages/index.drx");
  assert.equal(
    await resolveDotReactDiagnosticFile(root, "/_dotreact/dev/", "https://example.test/_dotreact/dev/src/pages/index.drx"),
    await fs.realpath(page));
  await assert.rejects(
    resolveDotReactDiagnosticFile(root, "/_dotreact/dev/", `http://example.test/@fs/${path.join(outside, "secret.ts").replaceAll("\\", "/")}`),
    /project code file/);
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
  const pages = await scanDotReactPages(root, "src/pages");
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
  await assert.rejects(scanDotReactPages(root, "src/pages"), /Duplicate DotReact moduleId/);
});

test("virtual module uses static imports and DRX is transformed as TSX", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const plugin = dotReact({ pagesDir: "src/pages" });
  assert.equal(typeof plugin.configResolved, "function");
  await (plugin.configResolved as (config: object) => void)({ root });
  const loaded = await (plugin.load as (id: string) => Promise<string>)("\0virtual:dotreact/pages");
  assert.match(loaded, /import \* as page0 from/);
  assert.match(loaded, /dotReactDefaultBoundaries/);
  assert.match(loaded, /"admin\/users": page0/);
  const transformed = await (plugin.transform as (code: string, id: string) => Promise<{ code: string }>) (
    "interface Props { value: string }; export default ({ value }: Props) => <main>{value}</main>;",
    path.join(root, "src/pages/typed.drx")
  );
  assert.doesNotMatch(transformed.code, /interface Props/);
  assert.match(transformed.code, /jsx/);
});

test("framework virtual client entry owns hydration and imports only configured project styles", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "src/styles.css"), ":root { color: black; }");
  const plugin = dotReact({ pagesDir: "src/pages" });
  await (plugin.configResolved as (config: object) => void)({ root });
  const entry = await (plugin.load as (id: string) => Promise<string>)("\0virtual:dotreact/client-entry");
  assert.match(entry, /bootstrapDotReactLazyClient/);
  assert.match(entry, /globalError/);
  assert.match(entry, /routeLoaders/);
  assert.match(entry, /src\/styles\.css/);
  assert.doesNotMatch(entry, /entry-client\.tsx/);

  const unsafe = dotReact({ pagesDir: "src/pages", clientStyles: "../outside.css" });
  await (unsafe.configResolved as (config: object) => void)({ root });
  await assert.rejects(
    (unsafe.load as (id: string) => Promise<string>)("\0virtual:dotreact/client-entry"),
    /must be contained/);
});

test("client route registry uses dynamic imports for page-level code splitting", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const plugin = dotReact({ pagesDir: "src/pages", clientStyles: false });
  await (plugin.configResolved as (config: object) => void)({ root });
  const registry = await (plugin.load as (id: string) => Promise<string>)("\0virtual:dotreact/client-pages");
  assert.match(registry, /Promise\.all/);
  assert.match(registry, /import\(\"\/@fs\//);
  assert.match(registry, /dotReactDefaultBoundaries/);
  assert.doesNotMatch(registry, /import \* as page0/);
});

test("production client entry extracts route CSS into the blocking application stylesheet", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "src/pages/admin/users.drx"),
    'import "./users.css"; export default () => <main />;');
  await fs.writeFile(path.join(root, "src/pages/admin/users.css"), ".users { display: grid; }");
  const plugin = dotReact({ pagesDir: "src/pages", clientStyles: false });
  await (plugin.configResolved as (config: object) => void)({ root, command: "build", build: { ssr: false, cssCodeSplit: false } });

  const entry = await (plugin.load as (id: string) => Promise<string>)("\0virtual:dotreact/client-entry");
  const styles = await (plugin.load as (id: string) => Promise<string>)("\0virtual:dotreact/client-styles");

  assert.match(entry, /virtual:dotreact\/client-styles/);
  assert.match(styles, /users\.css/);
});

test("production route manifest maps pages to their layouts and boundaries", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dotreact-route-assets-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "app/dashboard"), { recursive: true });
  await fs.writeFile(path.join(root, "app/layout.drx"), "export default ({ children }) => children;");
  await fs.writeFile(path.join(root, "app/dashboard/page.drx"), "export default () => <main />;");
  await fs.writeFile(path.join(root, "app/dashboard/error.drx"), "export default () => null;");

  const manifest = createDotReactRouteAssetManifest(await scanDotReactGraph(root, "app"), root);

  assert.deepEqual(manifest.routes, [{
    moduleId: "dashboard/page",
    hydrate: false,
    modules: ["app/layout.drx", "app/dashboard/page.drx", "app/dashboard/error.drx"]
  }]);
});

test("route graph enables hydration only when browser behavior is detected", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dotreact-hydration-analysis-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "app/static"), { recursive: true });
  await fs.mkdir(path.join(root, "app/interactive"), { recursive: true });
  await fs.mkdir(path.join(root, "app/router"), { recursive: true });
  await fs.mkdir(path.join(root, "app/_components"), { recursive: true });
  await fs.writeFile(path.join(root, "app/static/page.drx"),
    'import { definePage } from "@blackredsolutionsteam/dotreact-client/router"; export default definePage(() => <main>Static</main>);');
  await fs.writeFile(path.join(root, "app/_components/Counter.tsx"),
    'import { useState } from "react"; export default function Counter() { const [value] = useState(0); return <button>{value}</button>; }');
  await fs.writeFile(path.join(root, "app/interactive/page.drx"),
    'import Counter from "../_components/Counter"; export default () => <Counter />;');
  await fs.writeFile(path.join(root, "app/router/page.drx"),
    'import { useDotReactRouter } from "@blackredsolutionsteam/dotreact-client/router"; export default function Page() { const router = useDotReactRouter(); return <main>{router.url}</main>; }');

  const graph = await scanDotReactGraph(root, "app");

  assert.equal(graph.pages.find(page => page.moduleId === "static/page")?.hydrate, false);
  assert.equal(graph.pages.find(page => page.moduleId === "interactive/page")?.hydrate, true);
  assert.equal(graph.pages.find(page => page.moduleId === "router/page")?.hydrate, true);
});

test("framework virtual server entry owns SSR composition", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const plugin = dotReact({ pagesDir: "src/pages", clientStyles: false });
  await (plugin.configResolved as (config: object) => void)({ root });
  const entry = await (plugin.load as (id: string) => Promise<string>)("\0virtual:dotreact/server-entry");
  assert.match(entry, /createDotReactReactRuntime/);
  assert.match(entry, /fontPreloads/);
  assert.match(entry, /export const renderStream/);
});

test("framework font configuration emits CSS and SSR preload metadata", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "src/styles.css"), ":root { color: black; }");
  const font = localFont({ family: "Satoshi", variable: "--font-sans", src: { path: "/fonts/Satoshi.woff2", weight: 400 } });
  const plugin = dotReact({ pagesDir: "src/pages", fonts: [font] });
  await (plugin.configResolved as (config: object) => void)({ root });
  const entry = await (plugin.load as (id: string) => Promise<string>)("\0virtual:dotreact/client-entry");
  assert.match(entry, /virtual:dotreact\/fonts\.css/);
  const css = await (plugin.load as (id: string) => Promise<string>)("\0virtual:dotreact/fonts.css");
  assert.match(css, /--font-sans/);
  assert.match(css, /Satoshi\.woff2/);
  const pages = await (plugin.load as (id: string) => Promise<string>)("\0virtual:dotreact/pages");
  assert.match(pages, /fontPreloads/);
  assert.match(pages, /font\/woff2/);
});

test("server-only modules fail closed when requested by the browser bundle", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const plugin = dotReact({ pagesDir: "src/pages" });
  await (plugin.configResolved as (config: object) => void)({ root });
  await assert.rejects(
    (plugin.transform as (code: string, id: string, options: { ssr: boolean }) => Promise<unknown>)(
      "export const secret = 'server';",
      path.join(root, "src/data.server.ts"),
      { ssr: false }
    ),
    /server-only module cannot enter the browser bundle/
  );
});

test("composes root and nested layouts from root to leaf without registering layouts as pages", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "src/pages/layout.drx"), "export default ({ children }) => <div>{children}</div>;");
  await fs.writeFile(path.join(root, "src/pages/admin/layout.drx"), "export default ({ children }) => <section>{children}</section>;");

  const graph = await scanDotReactGraph(root, "src/pages");
  const admin = graph.pages.find(page => page.moduleId === "admin/users");
  assert.equal(graph.layouts.length, 2);
  assert.equal(admin?.layouts.length, 2);
  assert.equal(graph.pages.some(page => page.moduleId.endsWith("layout")), false);

  const plugin = dotReact({ pagesDir: "src/pages" });
  await (plugin.configResolved as (config: object) => void)({ root });
  const loaded = await (plugin.load as (id: string) => Promise<string>)("\0virtual:dotreact/pages");
  assert.match(loaded, /createElement\(Layout0, \{ pageProps: props \}, createElement\(Layout1, \{ pageProps: props \}, createElement\(page0\.default, props\)\)\)/);
  assert.match(loaded, /export const routeModules = Object\.freeze/);
  assert.match(loaded, /export const routeLayouts = Object\.freeze/);
  assert.match(loaded, /"admin\/users": Object\.freeze\(\[Layout0,Layout1\]\)/);
});

test("fails closed when frontend pages drift from the backend manifest", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "backend.json"), JSON.stringify({
    schemaVersion: 1,
    pages: [{ moduleId: "missing/page", propsType: "Test.MissingProps" }],
    actions: []
  }));
  const plugin = dotReact({ pagesDir: "src/pages", backendManifest: "backend.json" });
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
  const plugin = dotReact({ pagesDir: "src/pages", backendManifest: "backend.json" });
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
    compilerOptions: {
      target: "ES2023",
      module: "ESNext",
      moduleResolution: "Bundler",
      jsx: "react-jsx",
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      noEmit: true
    },
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
    pagesDir: "src/pages",
    backendManifest: "backend.json",
    contracts: "src/contracts.ts"
  });
  assert.equal(result.diagnostics.some(diagnostic =>
    diagnostic.file === "src/pages/index.drx" && diagnostic.message.includes("doesNotExist")), true,
    JSON.stringify(result.diagnostics));
  assert.equal(result.diagnostics.some(diagnostic => diagnostic.file?.endsWith(".drx.tsx") === true), false);
  assert.equal(result.diagnostics.some(diagnostic => diagnostic.code === 6133 || diagnostic.code === 6196), false,
    JSON.stringify(result.diagnostics));
});

test("semantic checker rejects JavaScript server actions and server-only imports in hydrated DRX", async (context) => {
  const root = await fs.mkdtemp(path.join(process.cwd(), ".tmp-dotreact-runtime-check-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "src/pages"), { recursive: true });
  await fs.writeFile(path.join(root, "tsconfig.json"), JSON.stringify({
    compilerOptions: { target: "ES2023", module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", noEmit: true },
    include: ["src/**/*.ts", "src/**/*.tsx"]
  }));
  await fs.writeFile(path.join(root, "src/pages/page.drx"), [
    '"use server";',
    'import secret from "../secret.server";',
    "export default function Page() { return <main>{secret}</main>; }"
  ].join("\n"));
  await fs.writeFile(path.join(root, "src/secret.server.ts"), "export default 'secret';\n");

  const result = await checkDotReactProject({ root, pagesDir: "src/pages" });
  assert.equal(result.diagnostics.some(diagnostic => diagnostic.code === "DRX1001"), true);
  assert.equal(result.diagnostics.some(diagnostic => diagnostic.code === "DRX1002"), true);
});

test("classifies special boundaries separately and selects the nearest ancestor per kind", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "src/pages/not-found.drx"), "export default () => null;");
  await fs.writeFile(path.join(root, "src/pages/error.drx"), "export default () => null;");
  await fs.writeFile(path.join(root, "src/pages/loading.drx"), "export default () => null;");
  await fs.writeFile(path.join(root, "src/pages/admin/error.drx"), "export default () => null;");

  const graph = await scanDotReactGraph(root, "src/pages");
  assert.equal(graph.pages.some(page => /(?:not-found|error|loading)$/.test(page.moduleId)), false);
  assert.equal(graph.boundaries.length, 4);
  const rootPage = graph.pages.find(page => page.moduleId === "index");
  const nestedPage = graph.pages.find(page => page.moduleId === "admin/users");
  assert.equal(path.basename(rootPage?.boundaries.notFound ?? ""), "not-found.drx");
  assert.equal(path.dirname(rootPage?.boundaries.error ?? ""), path.join(root, "src/pages"));
  assert.equal(path.basename(nestedPage?.boundaries.notFound ?? ""), "not-found.drx");
  assert.equal(path.dirname(nestedPage?.boundaries.error ?? ""), path.join(root, "src/pages/admin"));
  assert.equal(path.basename(nestedPage?.boundaries.loading ?? ""), "loading.drx");
});

test("virtual module exposes a separate page-keyed boundary registry", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "src/pages/not-found.drx"), "export const marker = 'root'; export default () => null;");
  await fs.writeFile(path.join(root, "src/pages/loading.drx"), "export const marker = 'loading'; export default () => null;");
  await fs.writeFile(path.join(root, "src/pages/admin/error.drx"), "export const marker = 'nested'; export default () => null;");
  const plugin = dotReact({ pagesDir: "src/pages" });
  await (plugin.configResolved as (config: object) => void)({ root });
  const loaded = await (plugin.load as (id: string) => Promise<string>)("\0virtual:dotreact/pages");
  assert.match(loaded, /import \* as boundary\d+ from/);
  assert.match(loaded, /export const boundaries = Object\.freeze/);
  assert.match(loaded, /"admin\/users": Object\.freeze\(\{notFound: boundary\d+,error: boundary\d+,loading: boundary\d+\}\)/);
  assert.match(loaded, /"index": Object\.freeze\(\{notFound: boundary\d+,error: dotReactDefaultBoundaries\.error,loading: boundary\d+\}\)/);
});

test("virtual module supplies framework boundaries when the project declares none", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const plugin = dotReact({ pagesDir: "src/pages" });
  await (plugin.configResolved as (config: object) => void)({ root });
  const loaded = await (plugin.load as (id: string) => Promise<string>)("\0virtual:dotreact/pages");
  assert.match(loaded, /notFound: dotReactDefaultBoundaries\.notFound/);
  assert.match(loaded, /error: dotReactDefaultBoundaries\.error/);
  assert.match(loaded, /loading: dotReactDefaultBoundaries\.loading/);
});

test("app/global-error.drx is a single production root boundary and virtual export", async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dotreact-global-error-"));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "app"), { recursive: true });
  await fs.writeFile(path.join(root, "app/page.drx"), "export default function Page() { return null; }");
  await fs.writeFile(path.join(root, "app/global-error.drx"),
    "export default function GlobalError({ reset }: { error: Error; reset(): void }) { return <button onClick={reset}>Retry</button>; }");
  const graph = await scanDotReactGraph(root, "app");
  assert.equal(graph.globalError, await fs.realpath(path.join(root, "app/global-error.drx")));
  assert.equal(graph.pages.some(page => page.moduleId.includes("global-error")), false);
  const plugin = dotReact({ pagesDir: "app" });
  await (plugin.configResolved as (config: object) => void)({ root });
  const loaded = await (plugin.load as (id: string) => Promise<string>)("\0virtual:dotreact/pages");
  assert.match(loaded, /import GlobalError from/);
  assert.match(loaded, /export const globalError = GlobalError/);

  await fs.mkdir(path.join(root, "app/admin"), { recursive: true });
  await fs.writeFile(path.join(root, "app/admin/global-error.drx"), "export default () => null;");
  await assert.rejects(scanDotReactGraph(root, "app"), /must exist at the root/);
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
  const result = await checkDotReactProject({ root, pagesDir: "src/pages" });
  assert.equal(result.boundaryCount, 1);
  assert.equal(result.diagnostics.some(diagnostic =>
    diagnostic.message.includes("DotReactBoundaryProps") || diagnostic.message.includes("message")), true,
    JSON.stringify(result.diagnostics));
});

test("application DRX changes keep Fast Refresh while client runtime changes reload atomically", async (context) => {
  const root = await fixture();
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const boundary = path.join(root, "src/pages/error.drx");
  await fs.writeFile(boundary, "export default () => null;");
  const plugin = dotReact({ pagesDir: "src/pages", backendManifest: "src/backend-manifest.json" });
  await (plugin.configResolved as (config: object) => void)({ root });
  const messages: unknown[] = [];
  const handleHotUpdate = plugin.handleHotUpdate as (context: object) => unknown;
  const server = { ws: { send: (message: unknown) => messages.push(message) } };
  assert.equal(handleHotUpdate({ file: boundary, server }), undefined);
  assert.deepEqual(messages, []);
  assert.deepEqual(handleHotUpdate({ file: path.join(root, "vendor/client/dist/router.js"), server }), []);
  assert.deepEqual(handleHotUpdate({ file: path.join(root, "src/backend-manifest.json"), server }), []);
  assert.deepEqual(messages, [
    { type: "full-reload", path: "*" },
    { type: "full-reload", path: "*" }
  ]);
});
