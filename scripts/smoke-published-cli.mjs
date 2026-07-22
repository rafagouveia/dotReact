import { existsSync, readFileSync, rmSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const registry = "https://npm.pkg.github.com";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const cliManifest = JSON.parse(readFileSync(resolve("packages/cli/package.json"), "utf8"));
const cliPackage = `${cliManifest.name}@${cliManifest.version}`;

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, env: process.env, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}.`);
}

async function waitForPackage() {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const result = spawnSync(npm, ["view", cliPackage, "version", `--registry=${registry}`], {
      env: process.env,
      encoding: "utf8"
    });
    if (result.error) throw result.error;
    if (result.status === 0) return;
    if (attempt === 6)
      throw new Error(`Published package ${cliPackage} was not readable after ${attempt} attempts.\n${result.stderr}`);
    await delay(10_000);
  }
}

if (!process.env.NODE_AUTH_TOKEN) throw new Error("NODE_AUTH_TOKEN is required for the private npm smoke test.");
if (!process.env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is required for the private NuGet smoke test.");
if (!process.env.GITHUB_ACTOR) throw new Error("GITHUB_ACTOR is required for the private NuGet smoke test.");

await waitForPackage();

const smokeRoot = await mkdtemp(join(tmpdir(), "dotreact-published-cli-"));
const projectDirectory = join(smokeRoot, "published-app");
const globalPrefix = join(smokeRoot, "global-cli");
const dotreact = process.platform === "win32"
  ? join(globalPrefix, "dotreact.cmd")
  : join(globalPrefix, "bin", "dotreact");
try {
  run(npm, ["install", "--global", cliPackage, `--prefix=${globalPrefix}`, `--registry=${registry}`], smokeRoot);
  run(dotreact, ["create", "published-app", "--template", "minimal"], smokeRoot);
  if (existsSync(join(projectDirectory, "vendor"))) throw new Error("Published scaffolds must not contain vendored framework source.");

  run("dotnet", [
    "nuget", "update", "source", "github-dotreact",
    "--configfile", join(projectDirectory, "NuGet.config"),
    "--username", process.env.GITHUB_ACTOR,
    "--password", process.env.GITHUB_TOKEN,
    "--store-password-in-clear-text"
  ], projectDirectory);
  run(npm, ["install"], projectDirectory);
  run(dotreact, ["doctor"], projectDirectory);
  run(npm, ["run", "typecheck"], projectDirectory);
  run(dotreact, ["build"], projectDirectory);
  process.stdout.write(`[dotreact] ${cliPackage} direct command created, delegated, diagnosed and built a clean project.\n`);
} finally {
  rmSync(smokeRoot, { recursive: true, force: true });
}
