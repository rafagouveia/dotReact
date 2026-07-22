import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const config = require("../lighthouserc.cjs");
const target = process.env.LHCI_URL;

if (!target) throw new Error("Set LHCI_URL to a running production DotReact URL.");
const url = new URL(target);
if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
  throw new Error("LHCI_URL must be an HTTP(S) URL without credentials.");

const initial = await fetch(url, { redirect: "follow", headers: { Accept: "text/html" } });
const html = await initial.text();
if (!initial.ok) throw new Error(`Lighthouse target returned HTTP ${initial.status}.`);
if (html.includes("/_dotreact/dev/") || html.includes("@react-refresh"))
  throw new Error("Refusing to audit the DotReact development server. Use a production build or preview deployment.");

const outputRoot = resolve(".dotreact/lighthouse");
await mkdir(outputRoot, { recursive: true });
const lighthouseCli = resolve("node_modules/lighthouse/cli/index.js");
const reports = [];

for (let run = 1; run <= config.runs; run += 1) {
  const output = resolve(outputRoot, `report-${run}.json`);
  const result = spawnSync(process.execPath, [
    lighthouseCli,
    url.href,
    "--output=json",
    `--output-path=${output}`,
    "--preset=desktop",
    "--quiet",
    "--chrome-flags=--headless --no-sandbox"
  ], { stdio: "inherit", shell: false });
  if (result.status !== 0) throw new Error(`Lighthouse run ${run} failed with exit code ${result.status}.`);
  reports.push(JSON.parse(await readFile(output, "utf8")));
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

const failures = [];
for (const [name, minimum] of Object.entries(config.categories)) {
  const score = median(reports.map(report => report.categories[name]?.score ?? 0));
  process.stdout.write(`${name}: ${Math.round(score * 100)} (minimum ${Math.round(minimum * 100)})\n`);
  if (score < minimum) failures.push(`${name} scored ${Math.round(score * 100)}`);
}
for (const [name, maximum] of Object.entries(config.audits)) {
  const value = median(reports.map(report => report.audits[name]?.numericValue ?? Number.POSITIVE_INFINITY));
  process.stdout.write(`${name}: ${Math.round(value * 100) / 100} (maximum ${maximum})\n`);
  if (value > maximum) failures.push(`${name} measured ${Math.round(value * 100) / 100}`);
}

if (failures.length > 0) throw new Error(`Lighthouse budgets failed:\n- ${failures.join("\n- ")}`);
process.stdout.write(`Lighthouse budgets passed. Reports: ${outputRoot}\n`);
