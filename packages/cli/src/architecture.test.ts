import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { validateProjectArchitecture } from "./architecture.js";

async function withProject(run: (root: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(resolve(tmpdir(), "dotreact-architecture-"));
  try {
    await mkdir(resolve(root, "app"), { recursive: true });
    await writeFile(resolve(root, "app/page.drx"), "export default function Page() { return null; }\n");
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("accepts co-located private components and Server Actions", async () => {
  await withProject(async root => {
    await mkdir(resolve(root, "app/catalog/_components"), { recursive: true });
    await mkdir(resolve(root, "app/catalog/_actions"), { recursive: true });
    await writeFile(resolve(root, "app/catalog/_components/Card.tsx"), "export function Card() { return null; }\n");
    await writeFile(resolve(root, "app/catalog/_actions/Save.server.cs"), "[DotReactAction(\"save\")] sealed class Save {}\n");
    const report = await validateProjectArchitecture(root);
    assert.deepEqual(report.issues, []);
  });
});

test("rejects UI outside app but only advises about application-owned server choices", async () => {
  await withProject(async root => {
    for (const directory of ["src/features", "Server/Actions", "Server/wwwroot"])
      await mkdir(resolve(root, directory), { recursive: true });
    await writeFile(resolve(root, "src/features/Legacy.tsx"), "export {};\n");
    await writeFile(resolve(root, "Server/Actions/SaveAction.cs"), "[DotReactAction(\"save\")] sealed class Save {}\n");
    await writeFile(resolve(root, "Server/wwwroot/logo.css"), "body {}\n");
    const report = await validateProjectArchitecture(root);
    assert.deepEqual(new Set(report.issues.map(item => item.code)), new Set(["DRX002", "DRX004", "DRX006"]));
    assert.equal(report.issues.find(item => item.code === "DRX002")?.severity, "error");
    assert.equal(report.issues.find(item => item.code === "DRX004")?.severity, "warning");
    assert.equal(report.issues.find(item => item.code === "DRX006")?.severity, "warning");
  });
});

test("rejects app components that can be mistaken for route-owned source", async () => {
  await withProject(async root => {
    await mkdir(resolve(root, "app/catalog"), { recursive: true });
    await writeFile(resolve(root, "app/catalog/Card.tsx"), "export function Card() { return null; }\n");
    const report = await validateProjectArchitecture(root);
    assert.equal(report.issues[0]?.code, "DRX005");
  });
});
