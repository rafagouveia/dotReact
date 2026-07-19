const path = require("node:path");

function moduleIdForPath(root, filePath) {
  const pages = path.resolve(root, "src", "pages");
  const absolute = path.resolve(filePath);
  const relative = path.relative(pages, absolute).replaceAll("\\", "/");
  if (relative === "" || relative.startsWith("../") || path.isAbsolute(relative) || !relative.endsWith(".drx"))
    return undefined;
  return relative.slice(0, -4);
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

module.exports = { moduleIdForPath, parseDiagnostics };
