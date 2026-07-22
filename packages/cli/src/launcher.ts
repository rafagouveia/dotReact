import { existsSync, readFileSync, realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cliPackageName = "@rafagouveia/dotreact-cli";
const delegationGuard = "DOTREACT_CLI_DELEGATED";
const currentBin = resolve(dirname(fileURLToPath(import.meta.url)), "../bin/dotreact.js");

interface PackageManifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly optionalDependencies?: Readonly<Record<string, string>>;
}

function canonicalPath(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return resolve(path);
  }
}

function declaresCli(manifest: PackageManifest): boolean {
  return manifest.dependencies?.[cliPackageName] !== undefined
    || manifest.devDependencies?.[cliPackageName] !== undefined
    || manifest.optionalDependencies?.[cliPackageName] !== undefined;
}

/**
 * Finds the nearest explicitly declared project-local CLI. Merely placing a
 * similarly named file below node_modules is not enough to make the global
 * launcher execute it.
 */
export function resolveProjectCli(startDirectory: string, launcherBin = currentBin): string | undefined {
  let directory = resolve(startDirectory);
  const volumeRoot = parse(directory).root;
  while (true) {
    const packagePath = resolve(directory, "package.json");
    if (existsSync(packagePath)) {
      try {
        const manifest = JSON.parse(readFileSync(packagePath, "utf8")) as PackageManifest;
        if (declaresCli(manifest)) {
          const candidate = resolve(directory, "node_modules", "@rafagouveia", "dotreact-cli", "bin", "dotreact.js");
          if (existsSync(candidate) && canonicalPath(candidate) !== canonicalPath(launcherBin)) return candidate;
          if (!existsSync(candidate) && process.env[delegationGuard] !== "1")
            throw new Error(`DotReact CLI is declared by ${packagePath} but is not installed. Run npm install.`);
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("DotReact CLI is declared")) throw error;
        // The CLI command itself will provide the project diagnostic. A broken
        // package manifest must never redirect execution to an arbitrary file.
      }
    }
    if (directory === volumeRoot) return undefined;
    directory = dirname(directory);
  }
}

export async function launchDotReact(): Promise<void> {
  const localCli = process.env[delegationGuard] === "1" ? undefined : resolveProjectCli(process.cwd());
  if (localCli !== undefined) {
    const result = spawnSync(process.execPath, [localCli, ...process.argv.slice(2)], {
      env: { ...process.env, [delegationGuard]: "1" },
      stdio: "inherit"
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
    return;
  }
  await import("./index.js");
}
