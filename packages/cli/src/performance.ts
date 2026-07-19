import { gzipSync } from "node:zlib";
import { readFile, readdir } from "node:fs/promises";
import { extname, resolve } from "node:path";

export interface BundleBudget {
  clientKb: number;
  ssrKb: number;
}

export interface BundleReport {
  client: { rawBytes: number; gzipBytes: number; files: number };
  ssr: { rawBytes: number; gzipBytes: number; files: number };
}

export async function analyzeBundles(root: string, budget: BundleBudget): Promise<BundleReport> {
  const report = {
    client: await measure(resolve(root, "dist/client")),
    ssr: await measure(resolve(root, "dist/server"))
  };
  const failures: string[] = [];
  if (report.client.gzipBytes > budget.clientKb * 1024)
    failures.push(`client gzip ${formatKb(report.client.gzipBytes)} exceeds ${budget.clientKb} KiB`);
  if (report.ssr.gzipBytes > budget.ssrKb * 1024)
    failures.push(`SSR gzip ${formatKb(report.ssr.gzipBytes)} exceeds ${budget.ssrKb} KiB`);
  if (failures.length > 0) throw new Error(`Bundle budget failed: ${failures.join("; ")}.`);
  return report;
}

export function formatReport(report: BundleReport): string {
  return [
    "DotReact bundle analysis",
    `  client: ${formatKb(report.client.rawBytes)} raw / ${formatKb(report.client.gzipBytes)} gzip (${report.client.files} files)`,
    `  SSR:    ${formatKb(report.ssr.rawBytes)} raw / ${formatKb(report.ssr.gzipBytes)} gzip (${report.ssr.files} files)`
  ].join("\n");
}

async function measure(directory: string): Promise<{ rawBytes: number; gzipBytes: number; files: number }> {
  const files = await walk(directory);
  let rawBytes = 0;
  let gzipBytes = 0;
  for (const file of files.filter(item => [".js", ".css"].includes(extname(item)))) {
    const content = await readFile(file);
    rawBytes += content.byteLength;
    gzipBytes += gzipSync(content).byteLength;
  }
  return { rawBytes, gzipBytes, files: files.length };
}

async function walk(directory: string): Promise<string[]> {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new Error(`Build output was not found: ${directory}. Run dotreact build first.`);
    throw error;
  }
  const output: string[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) output.push(...await walk(path));
    else if (entry.isFile()) output.push(path);
  }
  return output;
}

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}
