import { spawnSync } from "node:child_process";

const targets = [
  "dotnet/DotReact.slnx",
  "examples/crud/Server.Tests/Server.Tests.csproj"
];

let vulnerable = false;
for (const target of targets) {
  const result = spawnSync("dotnet", [
    "list", target, "package", "--vulnerable", "--include-transitive", "--format", "json"
  ], { cwd: process.cwd(), encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status ?? 1);
  }
  const report = JSON.parse(result.stdout);
  const findings = [];
  visit(report, findings);
  if (findings.length > 0) {
    vulnerable = true;
    console.error(`Vulnerable NuGet packages found in ${target}:`);
    for (const finding of findings) console.error(`- ${JSON.stringify(finding)}`);
  }
}

if (vulnerable) process.exit(1);
console.log("No vulnerable NuGet packages found.");

function visit(value, findings) {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const item of value) visit(item, findings);
    return;
  }
  if (Array.isArray(value.vulnerabilities) && value.vulnerabilities.length > 0) findings.push(value);
  for (const child of Object.values(value)) visit(child, findings);
}
