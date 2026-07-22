import {
  DEPLOYMENT_ADAPTER_API_VERSION,
  type AdapterCapabilitiesV1,
  type DeploymentAdapterV1,
  type DeploymentManifestV1,
  type DeploymentPlanV1,
  type DeploymentPlatformV1,
  type DeploymentProbeV1
} from "./contract.js";
import { createDeploymentManifest, emitDeploymentManifest } from "./manifest.js";
import { DeploymentManifestValidationError } from "./validation.js";

export interface AzureDeploymentAdapterOptions {
  readonly target: "app-service" | "container-apps";
  readonly sharedCache?: "none" | "azure-managed-redis";
  readonly enablePpr?: boolean;
  readonly imageOptimization?: boolean;
  readonly minimumReplicas?: number;
  readonly maximumReplicas?: number;
}

const defaultProbes: readonly DeploymentProbeV1[] = [
  { name: "dotreact-liveness", kind: "liveness", path: "/_health/live", intervalSeconds: 15, timeoutSeconds: 2 },
  { name: "dotreact-readiness", kind: "readiness", path: "/_health/ready", intervalSeconds: 5, timeoutSeconds: 2 },
  { name: "dotreact-startup", kind: "startup", path: "/_health/ready", intervalSeconds: 2, timeoutSeconds: 2 }
];

export function createAzureDeploymentAdapter(options: AzureDeploymentAdapterOptions): DeploymentAdapterV1 {
  const cache = options.sharedCache ?? "none";
  const minimumReplicas = options.minimumReplicas ?? 1;
  const maximumReplicas = options.maximumReplicas ?? 1;
  if (!Number.isInteger(minimumReplicas) || !Number.isInteger(maximumReplicas)
    || minimumReplicas < 1 || maximumReplicas < minimumReplicas || maximumReplicas > 100) {
    throw new DeploymentManifestValidationError("Azure replica bounds are invalid.");
  }
  if (options.enablePpr === true && cache === "none")
    throw new DeploymentManifestValidationError("Azure PPR requires Azure Managed Redis shared cache.");

  const capabilities: AdapterCapabilitiesV1 = Object.freeze({
    streaming: true,
    sharedCache: cache !== "none",
    ppr: options.enablePpr === true && cache !== "none",
    imageOptimization: options.imageOptimization === true
  });
  const requiredServices = [
    ...(cache === "azure-managed-redis" ? ["azure-managed-redis"] : []),
    ...(options.imageOptimization === true ? ["image-processor"] : [])
  ];
  const platform: DeploymentPlatformV1 = {
    provider: "azure",
    target: options.target,
    settings: {
      externalPort: 8080,
      rendererLoopbackPort: 5178,
      minimumReplicas,
      maximumReplicas,
      immutableImages: true
    },
    requiredServices
  };
  const descriptor = {
    name: "@rafagouveia/dotreact-adapter-azure",
    version: "1.0.0",
    capabilities,
    platform,
    defaultProbes
  } as const;

  return Object.freeze({
    apiVersion: DEPLOYMENT_ADAPTER_API_VERSION,
    name: descriptor.name,
    version: descriptor.version,
    capabilities,
    createManifest(plan: DeploymentPlanV1): DeploymentManifestV1 {
      return createDeploymentManifest(descriptor, plan);
    },
    emitManifest(plan: DeploymentPlanV1): string {
      return emitDeploymentManifest(createDeploymentManifest(descriptor, plan));
    }
  });
}
