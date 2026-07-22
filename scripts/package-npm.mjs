import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const registry = "https://npm.pkg.github.com";
const packages = [
  "@blackredsolutionsteam/dotreact-protocol",
  "@blackredsolutionsteam/dotreact-client",
  "@blackredsolutionsteam/dotreact-font",
  "@blackredsolutionsteam/dotreact-image",
  "@blackredsolutionsteam/dotreact-script",
  "@blackredsolutionsteam/dotreact-adapter",
  "@blackredsolutionsteam/dotreact-rsc",
  "@blackredsolutionsteam/dotreact-vite",
  "@blackredsolutionsteam/dotreact-renderer",
  "@blackredsolutionsteam/dotreact-cli"
];
const mode = process.argv[2] ?? "pack";
const npmCli = process.env.npm_execpath;
const destination = resolve("artifacts/packages/npm");

if (mode !== "pack" && mode !== "publish") throw new Error("Usage: package-npm.mjs <pack|publish>");
if (!npmCli) throw new Error("Run this command through an npm script so npm_execpath is available.");
if (mode === "publish" && !process.env.NODE_AUTH_TOKEN)
  throw new Error("NODE_AUTH_TOKEN is required to publish private npm packages.");

if (mode === "pack") {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
}

for (const packageName of packages) {
  const args = mode === "pack"
    ? ["pack", "--workspace", packageName, "--pack-destination", destination]
    : ["publish", "--workspace", packageName, `--registry=${registry}`, "--access=restricted"];
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    stdio: "inherit",
    env: process.env
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${mode} failed for ${packageName}.`);
}
