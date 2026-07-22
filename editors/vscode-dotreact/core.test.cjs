const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const {
  checkerArguments,
  createCoalescingScheduler,
  moduleIdForPath,
  parseDiagnostics,
  resolveCheckerPath
} = require("./core.cjs");

test("moduleIdForPath maps nested DRX files and rejects paths outside pages", () => {
  const root = path.resolve("fixture");
  assert.equal(moduleIdForPath(root, path.join(root, "app/catalog/[slug]/page.drx")), "catalog/[slug]/page");
  assert.equal(moduleIdForPath(root, path.join(root, "src/pages/catalog/[slug]/page.drx")), "catalog/[slug]/page");
  assert.equal(moduleIdForPath(root, path.join(root, "src/pages/layout.drx")), "layout");
  assert.equal(moduleIdForPath(root, path.join(root, "src/contracts.ts")), undefined);
  assert.equal(moduleIdForPath(root, path.resolve(root, "../outside/page.drx")), undefined);
});

test("resolveCheckerPath prefers the published package and supports vendored previews", () => {
  const root = path.resolve("fixture");
  const published = path.join(root, "node_modules", "@rafagouveia", "dotreact-vite", "dist", "check-cli.js");
  const vendored = path.join(root, "vendor", "vite", "dist", "check-cli.js");
  assert.equal(resolveCheckerPath(root, candidate => candidate === published || candidate === vendored), published);
  assert.equal(resolveCheckerPath(root, candidate => candidate === vendored), vendored);
  assert.equal(resolveCheckerPath(root, () => false), undefined);
  assert.deepEqual(checkerArguments(), [
    "--project", "tsconfig.json", "--pages", "app",
    "--manifest", "src/backend-manifest.json", "--contracts", "src/contracts.ts"
  ]);
});

test("coalescing scheduler collapses bursts and queues at most one follow-up run", async () => {
  let callback;
  const timers = { setTimeout(value) { callback = value; return 1; }, clearTimeout() { callback = undefined; } };
  let release;
  let runs = 0;
  const scheduler = createCoalescingScheduler(async () => {
    runs += 1;
    if (runs === 1) await new Promise(resolve => { release = resolve; });
  }, 350, timers);

  scheduler.schedule();
  scheduler.schedule();
  callback();
  await Promise.resolve();
  scheduler.schedule();
  callback();
  release();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(runs, 2);
  scheduler.dispose();
});

test("parseDiagnostics converts checker output to zero-based editor positions", () => {
  const root = path.resolve("fixture");
  const stderr = [
    "src/pages/page.drx:4:9 error DRX1001: Props are incompatible.",
    "src/pages/layout.drx:1:1 warning DRX2001: Optional property expected.",
    "ordinary output that must be ignored"
  ].join("\n");
  const values = parseDiagnostics(stderr, root);
  assert.deepEqual(values, [
    { filePath: path.resolve(root, "src/pages/page.drx"), line: 3, column: 8, severity: "error", message: "Props are incompatible." },
    { filePath: path.resolve(root, "src/pages/layout.drx"), line: 0, column: 0, severity: "warning", message: "Optional property expected." }
  ]);
});
