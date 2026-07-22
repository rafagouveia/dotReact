import { spawnSync } from "node:child_process";

const target = "Server/Server.csproj";
const result = spawnSync("dotnet", [
  "list", target, "package", "--vulnerable", "--include-transitive", "--format", "json"
], { cwd: process.cwd(), encoding: "utf8" });

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const findings = [];
visit(JSON.parse(result.stdout), findings);
if (findings.length > 0) {
  console.error(`Vulnerable NuGet packages found in ${target}:`);
  for (const finding of findings) console.error(`- ${JSON.stringify(finding)}`);
  process.exit(1);
}
console.log("No vulnerable NuGet packages found.");

function visit(value, vulnerabilities) {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) visit(item, vulnerabilities);
    return;
  }
  if (Array.isArray(value.vulnerabilities) && value.vulnerabilities.length > 0)
    vulnerabilities.push(value);
  for (const child of Object.values(value)) visit(child, vulnerabilities);
}
