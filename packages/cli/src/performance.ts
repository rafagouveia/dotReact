import { gzipSync } from "node:zlib";
import { readFile, readdir } from "node:fs/promises";
import { extname, resolve } from "node:path";

export interface BundleBudget {
  clientKb: number;
  ssrKb: number;
  initialClientKb?: number;
  asyncChunkKb?: number;
  cssKb?: number;
}

interface BundleMeasurement {
  rawBytes: number;
  gzipBytes: number;
  files: number;
}

export interface BundleReport {
  client: BundleMeasurement;
  ssr: BundleMeasurement;
  initialClient: BundleMeasurement;
  largestAsyncChunk: BundleMeasurement;
  css: BundleMeasurement;
}

interface ViteManifestEntry {
  readonly file?: string;
  readonly isEntry?: boolean;
  readonly imports?: readonly string[];
  readonly css?: readonly string[];
}

export async function analyzeBundles(root: string, budget: BundleBudget): Promise<BundleReport> {
  const clientDirectory = resolve(root, "dist/client");
  const serverDirectory = resolve(root, "dist/server");
  const clientFiles = await walk(clientDirectory);
  const clientCode = clientFiles.filter(item => [".js", ".css"].includes(extname(item)));
  const cssFiles = clientFiles.filter(item => extname(item) === ".css");
  const initialFiles = await initialClientFiles(clientDirectory, clientCode);
  const initialSet = new Set(initialFiles.map(file => resolve(file)));
  const asyncChunks = clientFiles.filter(file => extname(file) === ".js" && !initialSet.has(resolve(file)));
  const asyncMeasurements = await Promise.all(asyncChunks.map(file => measureFiles([file])));
  const largestAsyncChunk = asyncMeasurements.sort((left, right) => right.gzipBytes - left.gzipBytes)[0]
    ?? emptyMeasurement();
  const report = {
    client: await measureFiles(clientCode),
    ssr: await measure(resolve(serverDirectory)),
    initialClient: await measureFiles(initialFiles.filter(file => extname(file) === ".js")),
    largestAsyncChunk,
    css: await measureFiles(cssFiles)
  };
  const failures: string[] = [];
  checkBudget(failures, "client gzip", report.client.gzipBytes, budget.clientKb);
  checkBudget(failures, "SSR gzip", report.ssr.gzipBytes, budget.ssrKb);
  checkBudget(failures, "initial client gzip", report.initialClient.gzipBytes, budget.initialClientKb);
  checkBudget(failures, "largest async chunk gzip", report.largestAsyncChunk.gzipBytes, budget.asyncChunkKb);
  checkBudget(failures, "CSS gzip", report.css.gzipBytes, budget.cssKb);
  if (failures.length > 0) throw new Error(`Bundle budget failed: ${failures.join("; ")}.`);
  return report;
}

export function formatReport(report: BundleReport): string {
  return [
    "DotReact bundle analysis",
    `  client total:  ${formatMeasurement(report.client)}`,
    `  initial JS:    ${formatMeasurement(report.initialClient)}`,
    `  largest async: ${formatMeasurement(report.largestAsyncChunk)}`,
    `  CSS total:     ${formatMeasurement(report.css)}`,
    `  SSR:           ${formatMeasurement(report.ssr)}`
  ].join("\n");
}

function checkBudget(failures: string[], label: string, bytes: number, budgetKb: number | undefined): void {
  if (budgetKb !== undefined && bytes > budgetKb * 1024)
    failures.push(`${label} ${formatKb(bytes)} exceeds ${budgetKb} KiB`);
}

async function initialClientFiles(directory: string, fallback: readonly string[]): Promise<string[]> {
  let manifest: Record<string, ViteManifestEntry>;
  try {
    manifest = JSON.parse(await readFile(resolve(directory, ".vite/manifest.json"), "utf8")) as Record<string, ViteManifestEntry>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [...fallback];
    throw new Error("Vite client manifest is invalid.", { cause: error });
  }
  const entries = Object.entries(manifest).filter(([, value]) => value.isEntry === true);
  if (entries.length === 0) return [...fallback];
  const discovered = new Set<string>();
  const visit = (key: string): void => {
    const entry = manifest[key];
    if (entry === undefined) return;
    if (entry.file !== undefined) discovered.add(resolve(directory, entry.file));
    for (const css of entry.css ?? []) discovered.add(resolve(directory, css));
    for (const imported of entry.imports ?? []) visit(imported);
  };
  for (const [key] of entries) visit(key);
  return [...discovered];
}

async function measure(directory: string): Promise<BundleMeasurement> {
  const files = (await walk(directory)).filter(item => [".js", ".css"].includes(extname(item)));
  return measureFiles(files);
}

async function measureFiles(files: readonly string[]): Promise<BundleMeasurement> {
  let rawBytes = 0;
  let gzipBytes = 0;
  for (const file of files) {
    const content = await readFile(file);
    rawBytes += content.byteLength;
    gzipBytes += gzipSync(content).byteLength;
  }
  return { rawBytes, gzipBytes, files: files.length };
}

function emptyMeasurement(): BundleMeasurement {
  return { rawBytes: 0, gzipBytes: 0, files: 0 };
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

function formatMeasurement(measurement: BundleMeasurement): string {
  return `${formatKb(measurement.rawBytes)} raw / ${formatKb(measurement.gzipBytes)} gzip (${measurement.files} files)`;
}

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}
