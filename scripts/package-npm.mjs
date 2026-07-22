import { mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const registry = "https://npm.pkg.github.com";
const packages = [
  "@rafagouveia/dotreact-protocol",
  "@rafagouveia/dotreact-client",
  "@rafagouveia/dotreact-font",
  "@rafagouveia/dotreact-image",
  "@rafagouveia/dotreact-script",
  "@rafagouveia/dotreact-adapter",
  "@rafagouveia/dotreact-rsc",
  "@rafagouveia/dotreact-vite",
  "@rafagouveia/dotreact-renderer",
  "@rafagouveia/dotreact-cli"
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
  const packageDirectory = packageName.replace("@rafagouveia/dotreact-", "");
  const manifest = JSON.parse(await readFile(resolve("packages", packageDirectory, "package.json"), "utf8"));
  if (mode === "publish") {
    const query = spawnSync(process.execPath, [npmCli, "view", `${packageName}@${manifest.version}`, "version", `--registry=${registry}`], {
      encoding: "utf8",
      env: process.env
    });
    if (query.error) throw query.error;
    if (query.status === 0) {
      process.stdout.write(`[dotreact] ${packageName}@${manifest.version} already exists; skipping.\n`);
      continue;
    }
    const diagnostic = `${query.stdout ?? ""}\n${query.stderr ?? ""}`;
    if (!/(?:E404|404 Not Found|is not in this registry)/iu.test(diagnostic))
      throw new Error(`Could not verify ${packageName}@${manifest.version} before publishing:\n${diagnostic.trim()}`);
  }
  const args = mode === "pack"
    ? ["pack", "--workspace", packageName, "--pack-destination", destination]
    : [
        "publish", "--workspace", packageName, `--registry=${registry}`, "--access=restricted",
        "--tag", manifest.version.includes("-") ? "experimental" : "latest"
      ];
  const result = spawnSync(process.execPath, [npmCli, ...args], {
    stdio: "inherit",
    env: process.env
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${mode} failed for ${packageName}.`);
}
