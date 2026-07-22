import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const output = resolve(packageRoot, "dist/template.json");
const ignored = /(^|[\\/])(\.git|node_modules|dist|bin|obj|\.dotreact|coverage|TestResults|\.playwright-cli)([\\/]|$)/u;
const entries = [];

async function addFile(source, target) {
  entries.push({
    path: target.replaceAll("\\", "/"),
    content: (await readFile(source)).toString("base64")
  });
}

async function addTree(sourceRoot, targetRoot = "") {
  for (const entry of await readdir(sourceRoot, { withFileTypes: true })) {
    const source = resolve(sourceRoot, entry.name);
    if (ignored.test(source)) continue;
    const target = targetRoot ? `${targetRoot}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await addTree(source, target);
    else if (entry.isFile()) await addFile(source, target);
  }
}

await addTree(resolve(repositoryRoot, "examples/starter"));
for (const file of [
  ".dockerignore",
  ".gitignore",
  ".gitattributes",
  ".editorconfig",
  ".npmrc",
  ".nvmrc",
  ".env.example",
  "global.json",
  "tsconfig.base.json"
]) await addFile(resolve(repositoryRoot, file), file);
await addFile(resolve(repositoryRoot, "dotnet/Directory.Build.props"), "Directory.Build.props");
await addTree(resolve(repositoryRoot, "deploy/azure"), "deploy/azure");
await addFile(resolve(packageRoot, "assets/NuGet.config"), "NuGet.config");

entries.sort((left, right) => left.path.localeCompare(right.path));
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify({ schemaVersion: 1, entries })}\n`);
process.stdout.write(`[dotreact] Embedded ${entries.length} template files.\n`);
