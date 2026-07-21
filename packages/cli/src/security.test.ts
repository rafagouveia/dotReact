import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { scanProjectSecurity } from "./security.js";

test("security scan reports browser XSS and persistent token sinks", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "dotreact-security-"));
  try {
    await mkdir(resolve(root, "app"), { recursive: true });
    await writeFile(resolve(root, "app/page.drx"), [
      "element.innerHTML = value;",
      "localStorage.setItem('access_token', token);"
    ].join("\n"));
    const report = await scanProjectSecurity(root);
    assert.deepEqual(report.findings.map(item => item.rule), ["DRXSEC001", "DRXSEC003"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("security scan ignores ordinary JSX interpolation", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "dotreact-security-"));
  try {
    await mkdir(resolve(root, "app"), { recursive: true });
    await writeFile(resolve(root, "app/page.drx"), "export default function Page({ value }) { return <p>{value}</p>; }\n");
    const report = await scanProjectSecurity(root);
    assert.deepEqual(report.findings, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("security scan reports server TLS bypass and interpolated raw SQL", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "dotreact-security-"));
  try {
    await mkdir(resolve(root, "Server"), { recursive: true });
    await writeFile(resolve(root, "Server/Unsafe.cs"), `
handler.ServerCertificateCustomValidationCallback = (_, _, _, _) => true;
db.Orders.FromSqlRaw($"SELECT * FROM Orders WHERE Id = {id}");
`);
    const report = await scanProjectSecurity(root);
    assert.deepEqual(report.findings.map(finding => finding.rule), ["DRXSEC006", "DRXSEC007"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
