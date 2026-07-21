#!/usr/bin/env node
import { checkDotReactProject } from "./check.js";

function value(args: string[], option: string): string | undefined {
  const index = args.indexOf(option);
  if (index < 0) return undefined;
  const result = args[index + 1];
  if (result === undefined || result.startsWith("--")) throw new Error(`${option} requires a value.`);
  return result;
}

try {
  const args = process.argv.slice(2);
  const tsconfig = value(args, "--project");
  const pagesDir = value(args, "--pages");
  const backendManifest = value(args, "--manifest");
  const contracts = value(args, "--contracts");
  const result = await checkDotReactProject({
    root: process.cwd(),
    ...(tsconfig === undefined ? {} : { tsconfig }),
    ...(pagesDir === undefined ? {} : { pagesDir }),
    ...(backendManifest === undefined ? {} : { backendManifest }),
    ...(contracts === undefined ? {} : { contracts })
  });
  for (const diagnostic of result.diagnostics) {
    const location = diagnostic.file === undefined ? "" : `${diagnostic.file}:${diagnostic.line ?? 1}:${diagnostic.column ?? 1} `;
    process.stderr.write(`${location}${diagnostic.category} DRX${diagnostic.code}: ${diagnostic.message}\n`);
  }
  if (result.diagnostics.some(diagnostic => diagnostic.category === "error")) process.exitCode = 1;
  else process.stdout.write(`DotReact check passed: ${result.pageCount} page(s), ${result.layoutCount} layout(s), ${result.boundaryCount} boundary file(s).\n`);
} catch (error) {
  process.stderr.write(`[dotreact-check] ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
