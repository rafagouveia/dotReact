import assert from "node:assert/strict";
import test from "node:test";
import { createAzureDeploymentAdapter } from "./azure.js";
import {
  CapabilityMismatchError,
  DeploymentManifestValidationError,
  redactDeploymentDiagnostics
} from "./index.js";
import type { DeploymentPlanV1 } from "./contract.js";

const assetA = {
  source: "dist/assets/app-abcdef12.js",
  path: "/assets/app-abcdef12.js",
  cacheControl: "public,max-age=31536000,immutable",
  integrity: "sha256-YWJjZA=="
} as const;
const assetB = {
  source: "dist/client.js",
  path: "/_dotreact/client.js",
  cacheControl: "public,max-age=0,must-revalidate"
} as const;

test("Azure manifest is canonical and deterministic across input ordering", () => {
  const adapter = createAzureDeploymentAdapter({
    target: "container-apps",
    sharedCache: "azure-managed-redis",
    enablePpr: true,
    imageOptimization: true,
    maximumReplicas: 3
  });
  const first: DeploymentPlanV1 = {
    requiredCapabilities: { streaming: true, sharedCache: true, ppr: true, imageOptimization: true },
    assets: [assetA, assetB],
    prerenders: [
      { route: "/products", assetPath: "/prerender/products.html", mode: "ppr" },
      { route: "/about", assetPath: "/prerender/about.html", mode: "static" }
    ],
    headers: [
      { route: "/assets/*", name: "X-Content-Type-Options", value: "nosniff" },
      { route: "/*", name: "Referrer-Policy", value: "no-referrer" }
    ],
    redirects: [
      { source: "/old", destination: "/new", status: 308 },
      { source: "/docs", destination: "https://docs.example.com/start", status: 307 }
    ],
    origins: [
      { origin: "https://images.example.com", purposes: ["images", "assets"] },
      { origin: "https://api.example.com", purposes: ["api"] }
    ],
    environment: [
      { name: "DATABASE_URL", required: true, secret: true, value: "postgres-secret-value" },
      { name: "ASPNETCORE_ENVIRONMENT", required: true, secret: false, value: "Production" }
    ]
  };
  const second: DeploymentPlanV1 = {
    ...first,
    assets: [assetB, assetA],
    prerenders: [...(first.prerenders ?? [])].reverse(),
    headers: [...(first.headers ?? [])].reverse(),
    redirects: [...(first.redirects ?? [])].reverse(),
    origins: [...(first.origins ?? [])].reverse(),
    environment: [...(first.environment ?? [])].reverse()
  };

  const emitted = adapter.emitManifest(first);

  assert.equal(emitted, adapter.emitManifest(second));
  assert.match(emitted, /^\{"adapter":/u);
  const manifest = adapter.createManifest(first);
  assert.deepEqual(manifest.probes.map((probe) => probe.kind), ["liveness", "readiness", "startup"]);
  assert.deepEqual(manifest.originRequirements.map((origin) => origin.origin),
    ["https://api.example.com", "https://images.example.com"]);
  assert.equal(manifest.platform.provider, "azure");
  assert.equal(manifest.platform.target, "container-apps");
});

test("capability requirements fail closed", () => {
  const adapter = createAzureDeploymentAdapter({ target: "app-service" });

  assert.throws(() => adapter.createManifest({
    requiredCapabilities: { sharedCache: true, ppr: true }
  }), (error: unknown) => {
    assert.ok(error instanceof CapabilityMismatchError);
    assert.deepEqual(error.missing, ["sharedCache", "ppr"]);
    return true;
  });
  assert.throws(
    () => createAzureDeploymentAdapter({ target: "container-apps", enablePpr: true }),
    /requires Azure Managed Redis/u
  );
});

test("secret values are omitted, leaked values are rejected, and diagnostics are redacted", () => {
  const adapter = createAzureDeploymentAdapter({ target: "container-apps" });
  const plan: DeploymentPlanV1 = {
    environment: [
      { name: "API_TOKEN", required: true, secret: true, value: "super-secret-token" },
      { name: "REGION", required: false, secret: false, value: "eastus2" }
    ]
  };

  const emitted = adapter.emitManifest(plan);
  assert.doesNotMatch(emitted, /super-secret-token|eastus2/u);
  assert.deepEqual(JSON.parse(emitted).environment, [
    { name: "API_TOKEN", required: true, secret: true },
    { name: "REGION", required: false, secret: false }
  ]);
  assert.deepEqual(redactDeploymentDiagnostics({
    message: "failed with super-secret-token",
    api_token: "another-value",
    nested: ["super-secret-token"]
  }, plan), {
    message: "failed with [REDACTED]",
    api_token: "[REDACTED]",
    nested: ["[REDACTED]"]
  });

  assert.throws(() => adapter.emitManifest({
    ...plan,
    headers: [{ route: "/*", name: "X-Debug", value: "super-secret-token" }]
  }), DeploymentManifestValidationError);
});
