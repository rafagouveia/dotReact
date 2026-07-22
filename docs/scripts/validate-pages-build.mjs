import { access, readFile } from "node:fs/promises";

function normalizeBasePath(value) {
  const basePath = value?.trim() || "/";
  if (!basePath.startsWith("/") || basePath.includes("..") || /[?#\\]/.test(basePath)) {
    throw new Error("DOTREACT_DOCS_BASE must be a safe absolute URL path.");
  }

  return basePath.endsWith("/") ? basePath : `${basePath}/`;
}

const basePath = normalizeBasePath(process.env.DOTREACT_DOCS_BASE);
const distribution = new URL("../dist/", import.meta.url);
const indexPath = new URL("index.html", distribution);
const indexHtml = await readFile(indexPath, "utf8");

if (indexHtml.includes('/src/main.tsx')) {
  throw new Error("The Pages artifact still references the development entry point.");
}

const localReferences = [...indexHtml.matchAll(/(?:href|src)="(\/[^"]+)"/g)]
  .map((match) => match[1])
  .filter((reference) => !reference.startsWith("//"));

for (const reference of localReferences) {
  if (!reference.startsWith(basePath)) {
    throw new Error(`Asset ${reference} does not use the configured base path ${basePath}.`);
  }
}

await access(new URL("dotreact-logo-v4.png", distribution));

const assetDirectory = new URL("assets/", distribution);
const entryReference = localReferences.find((reference) => reference.includes("/assets/") && reference.endsWith(".js"));
if (!entryReference) {
  throw new Error("The production HTML does not reference a JavaScript entry bundle.");
}

const entryName = entryReference.slice(entryReference.lastIndexOf("/") + 1);
const entrySource = await readFile(new URL(entryName, assetDirectory), "utf8");
if (!entrySource.includes(`${basePath}dotreact-logo-v4.png`)) {
  throw new Error("The application bundle does not resolve the logo through Vite's base path.");
}

const assetNames = [...indexHtml.matchAll(/(?:href|src)="[^"]*\/assets\/([^"]+)"/g)]
  .map((match) => match[1]);
const discoveredAssets = new Set(assetNames);
const pendingAssets = [...assetNames.filter((name) => name.endsWith(".js"))];
const visitedAssets = new Set();

while (pendingAssets.length > 0) {
  const assetName = pendingAssets.pop();
  if (!assetName || visitedAssets.has(assetName)) continue;

  visitedAssets.add(assetName);
  const assetSource = await readFile(new URL(assetName, assetDirectory), "utf8");
  for (const match of assetSource.matchAll(/["'`]\.\/([^"'`]+\.js)["'`]/g)) {
    if (!discoveredAssets.has(match[1])) {
      discoveredAssets.add(match[1]);
      pendingAssets.push(match[1]);
    }
  }
}

const languageChunks = [...discoveredAssets].filter((name) => /^prism-(?:bash|csharp|powershell)-/.test(name));
if (languageChunks.length !== 3) {
  throw new Error("Prism language grammars must remain deferred until the shared Prism instance is initialized.");
}

console.log(`GitHub Pages artifact validated for ${basePath}`);
