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

function declaredCliVersion(manifest: PackageManifest): string | undefined {
  return manifest.dependencies?.[cliPackageName]
    ?? manifest.devDependencies?.[cliPackageName]
    ?? manifest.optionalDependencies?.[cliPackageName];
}

/**
 * Finds the nearest explicitly declared project-local CLI. Merely placing a
 * similarly named file below node_modules is not enough to make the global
 * launcher execute it.
 */
export function resolveProjectCli(startDirectory: string, launcherBin = currentBin): string | undefined {
  let directory = resolve(startDirectory);
  const volumeRoot = parse(directory).root;
  let nearestDeclaration: { readonly packagePath: string; readonly version: string } | undefined;
  while (true) {
    const packagePath = resolve(directory, "package.json");
    if (existsSync(packagePath)) {
      try {
        const manifest = JSON.parse(readFileSync(packagePath, "utf8")) as PackageManifest;
        const version = declaredCliVersion(manifest);
        if (version !== undefined) {
          nearestDeclaration ??= { packagePath, version };
          const candidate = resolve(directory, "node_modules", "@rafagouveia", "dotreact-cli", "bin", "dotreact.js");
          if (existsSync(candidate)) {
            const installedManifest = JSON.parse(readFileSync(resolve(dirname(candidate), "../package.json"), "utf8")) as { version?: string };
            if (/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(nearestDeclaration.version)
              && installedManifest.version !== nearestDeclaration.version)
              throw new Error(`DotReact CLI ${nearestDeclaration.version} is declared by ${nearestDeclaration.packagePath}, but ${installedManifest.version ?? "an unknown version"} is installed. Run npm install.`);
            if (canonicalPath(candidate) !== canonicalPath(launcherBin)) return candidate;
            return undefined;
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("DotReact CLI")) throw error;
        // The CLI command itself will provide the project diagnostic. A broken
        // package manifest must never redirect execution to an arbitrary file.
      }
    }
    if (directory === volumeRoot) {
      if (nearestDeclaration !== undefined && process.env[delegationGuard] !== "1")
        throw new Error(`DotReact CLI is declared by ${nearestDeclaration.packagePath} but is not installed. Run npm install.`);
      return undefined;
    }
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
