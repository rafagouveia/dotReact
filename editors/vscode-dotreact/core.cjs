const fs = require("node:fs");
const path = require("node:path");

const checkerLocations = Object.freeze([
  ["node_modules", "@rafagouveia", "dotreact-vite", "dist", "check-cli.js"],
  ["vendor", "vite", "dist", "check-cli.js"],
  ["node_modules", "@dotreact", "vite", "dist", "check-cli.js"]
]);

function relativeModuleId(root, pagesRoot, filePath) {
  const pages = path.resolve(root, pagesRoot);
  const absolute = path.resolve(filePath);
  const relative = path.relative(pages, absolute).replaceAll("\\", "/");
  if (relative === "" || relative.startsWith("../") || path.isAbsolute(relative) || !relative.endsWith(".drx"))
    return undefined;
  return relative.slice(0, -4);
}

function moduleIdForPath(root, filePath) {
  return relativeModuleId(root, "app", filePath)
    ?? relativeModuleId(root, path.join("src", "pages"), filePath);
}

function resolveCheckerPath(root, exists = fs.existsSync) {
  for (const segments of checkerLocations) {
    const candidate = path.join(root, ...segments);
    if (exists(candidate)) return candidate;
  }
  return undefined;
}

function checkerArguments() {
  return [
    "--project", "tsconfig.json",
    "--pages", "app",
    "--manifest", "src/backend-manifest.json",
    "--contracts", "src/contracts.ts"
  ];
}

function parseDiagnostics(stderr, root) {
  const diagnostics = [];
  const pattern = /^(.+?):(\d+):(\d+) (error|warning) DRX[^:]+: (.+)$/gm;
  for (const match of stderr.matchAll(pattern)) {
    diagnostics.push({
      filePath: path.resolve(root, match[1]),
      line: Math.max(0, Number(match[2]) - 1),
      column: Math.max(0, Number(match[3]) - 1),
      severity: match[4],
      message: match[5]
    });
  }
  return diagnostics;
}

function createCoalescingScheduler(run, delayMs, timers = { setTimeout, clearTimeout }) {
  let timer;
  let running = false;
  let pending = false;
  let disposed = false;

  async function execute() {
    if (disposed) return;
    if (running) {
      pending = true;
      return;
    }
    running = true;
    try {
      await run();
    } finally {
      running = false;
      if (pending && !disposed) {
        pending = false;
        await execute();
      }
    }
  }

  return {
    schedule() {
      if (disposed) return;
      if (timer !== undefined) timers.clearTimeout(timer);
      timer = timers.setTimeout(() => {
        timer = undefined;
        void execute();
      }, delayMs);
    },
    runNow() {
      if (timer !== undefined) timers.clearTimeout(timer);
      timer = undefined;
      return execute();
    },
    dispose() {
      disposed = true;
      pending = false;
      if (timer !== undefined) timers.clearTimeout(timer);
      timer = undefined;
    }
  };
}

module.exports = {
  checkerArguments,
  createCoalescingScheduler,
  moduleIdForPath,
  parseDiagnostics,
  resolveCheckerPath
};
