import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const docsRoot = resolve(root, "docs/src");
const portugueseFiles = ["content.tsx", "content.guides.tsx", "content.security.tsx", "content.deploy.tsx"];
const linkedFiles = [...portugueseFiles, "LandingPage.tsx"];

const read = file => readFileSync(resolve(docsRoot, file), "utf8");
const idsFrom = source => [...source.matchAll(/\bid:\s*"([a-z0-9-]+)"\s*,\s*group:/gu)].map(match => match[1]);
const portugueseIds = portugueseFiles.flatMap(file => idsFrom(read(file)));
const englishSource = read("content.en.tsx");
const englishIds = idsFrom(englishSource);

assertUnique(portugueseIds, "Portuguese page ID");
assertUnique(englishIds, "English page ID");
assertSameSet(portugueseIds, englishIds, "Portuguese and English documentation pages");

for (const marker of [
  'import { docs as docsPt } from "./content"',
  'import { englishText } from "./content.en.catalog"',
  "localizeNode(portuguesePage.body)"
]) {
  if (!englishSource.includes(marker))
    throw new Error(`English rich-content parity is not wired: missing ${marker}`);
}

const requiredPages = [
  "overview", "purpose-applications", "beginner-learning-path", "first-project", "project-organization", "vscode-extension",
  "crud-guide", "security-model", "security-sessions", "security-identity-social", "security-tokens",
  "security-production-checklist", "hosting-overview", "production-readiness",
  "deploy-docker", "deploy-azure-app-service", "deploy-azure-container-apps", "domains-reverse-proxy",
  "deployment-pipeline", "deployment-operations"
];
for (const id of requiredPages) {
  if (!portugueseIds.includes(id)) throw new Error(`Required documentation page is missing: ${id}`);
}

const nonPageAnchors = new Set(["home", "purpose", "architecture", "benchmarks", "capabilities", "content"]);
const pageIds = new Set(portugueseIds);
for (const file of linkedFiles) {
  for (const match of read(file).matchAll(/href="#([a-z0-9-]+)"/gu)) {
    const target = match[1];
    if (!pageIds.has(target) && !nonPageAnchors.has(target))
      throw new Error(`Broken documentation link in ${file}: #${target}`);
  }
}

for (const path of [
  "examples/starter/Dockerfile.scaffold",
  "deploy/azure/app-service.bicep",
  "deploy/azure/app-service.parameters.example.json",
  "deploy/azure/container-apps.bicep",
  "deploy/azure/container-apps.parameters.example.json",
  "examples/crud/app/_actions/work-items/CreateWorkItemAction.server.cs",
  "examples/crud/Server/Composition/InfrastructureServices.cs",
  "examples/crud/Server/Infrastructure/Persistence/EfWorkItemRepository.cs",
  "examples/crud/Server/Infrastructure/Persistence/WorkItemsDbContext.cs",
  "examples/starter/docs/ai/08-AUTHENTICATION-SESSIONS.md",
  "dotnet/src/DotReact.AspNetCore/Authentication/DotReactSessionManager.cs",
  "dotnet/src/DotReact.Redis/RedisDotReactSessionStore.cs",
  "SECURITY.md"
]) {
  if (!existsSync(resolve(root, path))) throw new Error(`Documented project artifact is missing: ${path}`);
}

console.log(`Documentation content passed: ${portugueseIds.length} bilingual pages and internal links are valid.`);

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) throw new Error(`${label} is duplicated: ${value}`);
    seen.add(value);
  }
}

function assertSameSet(left, right, label) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const onlyLeft = [...leftSet].filter(value => !rightSet.has(value));
  const onlyRight = [...rightSet].filter(value => !leftSet.has(value));
  if (onlyLeft.length > 0 || onlyRight.length > 0)
    throw new Error(`${label} differ. Only PT: ${onlyLeft.join(", ") || "none"}; only EN: ${onlyRight.join(", ") || "none"}.`);
}
