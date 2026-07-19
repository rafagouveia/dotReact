const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { moduleIdForPath, parseDiagnostics } = require("./core.cjs");

test("moduleIdForPath maps nested DRX files and rejects paths outside pages", () => {
  const root = path.resolve("fixture");
  assert.equal(moduleIdForPath(root, path.join(root, "src/pages/catalog/[slug]/page.drx")), "catalog/[slug]/page");
  assert.equal(moduleIdForPath(root, path.join(root, "src/pages/layout.drx")), "layout");
  assert.equal(moduleIdForPath(root, path.join(root, "src/contracts.ts")), undefined);
  assert.equal(moduleIdForPath(root, path.resolve(root, "../outside/page.drx")), undefined);
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
