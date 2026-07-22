import { mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const source = "https://nuget.pkg.github.com/BlackRedSolutionsTeam/index.json";
const projects = [
  "dotnet/src/DotReact.AppGenerator/DotReact.AppGenerator.csproj",
  "dotnet/src/DotReact.AspNetCore/DotReact.AspNetCore.csproj",
  "dotnet/src/DotReact.Images.SkiaSharp/DotReact.Images.SkiaSharp.csproj",
  "dotnet/src/DotReact.Redis/DotReact.Redis.csproj",
  "dotnet/src/DotReact.Hosting/DotReact.Hosting.csproj",
  "dotnet/src/DotReact.TypeGen/DotReact.TypeGen.csproj"
];
const mode = process.argv[2] ?? "pack";
const destination = resolve("artifacts/packages/nuget");

if (mode !== "pack" && mode !== "publish") throw new Error("Usage: package-nuget.mjs <pack|publish>");

if (mode === "pack") {
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  for (const project of projects) {
    const result = spawnSync("dotnet", ["pack", project, "-c", "Release", "-o", destination], {
      stdio: "inherit",
      env: process.env
    });
    if (result.status !== 0) throw new Error(`pack failed for ${project}.`);
  }
} else {
  const token = process.env.BLACKRED_PACKAGES_TOKEN;
  if (!token) throw new Error("BLACKRED_PACKAGES_TOKEN is required to publish private NuGet packages.");
  const archives = (await readdir(destination))
    .filter(file => file.endsWith(".nupkg") && !file.endsWith(".snupkg"))
    .sort();
  if (archives.length !== projects.length) throw new Error("Run the NuGet pack step before publishing.");
  for (const archive of archives) {
    const result = spawnSync("dotnet", [
      "nuget", "push", resolve(destination, archive),
      "--api-key", token,
      "--source", source,
      "--skip-duplicate"
    ], { stdio: "inherit", env: process.env });
    if (result.status !== 0) throw new Error(`publish failed for ${archive}.`);
  }
}
