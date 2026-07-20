import {
  DEPLOYMENT_ADAPTER_API_VERSION,
  type AdapterCapabilitiesV1,
  type DeploymentManifestV1,
  type DeploymentPlanV1,
  type DeploymentPlatformV1,
  type DeploymentProbeV1
} from "./contract.js";
import { DeploymentManifestValidationError, secretValues, validatePlan } from "./validation.js";

export interface ManifestAdapterDescriptorV1 {
  readonly name: string;
  readonly version: string;
  readonly capabilities: AdapterCapabilitiesV1;
  readonly platform: DeploymentPlatformV1;
  readonly defaultProbes?: readonly DeploymentProbeV1[];
}

const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

export function createDeploymentManifest(
  descriptor: ManifestAdapterDescriptorV1,
  plan: DeploymentPlanV1
): DeploymentManifestV1 {
  validateDescriptor(descriptor);
  validatePlan(plan, descriptor.capabilities);
  const customKinds = new Set((plan.probes ?? []).map((probe) => probe.kind));
  const probes = [
    ...(descriptor.defaultProbes ?? []).filter((probe) => !customKinds.has(probe.kind)),
    ...(plan.probes ?? [])
  ];
  const normalizedPlan = { ...plan, probes };
  validatePlan(normalizedPlan, descriptor.capabilities);

  const manifest: DeploymentManifestV1 = {
    apiVersion: DEPLOYMENT_ADAPTER_API_VERSION,
    adapter: { name: descriptor.name, version: descriptor.version },
    capabilities: { ...descriptor.capabilities },
    platform: {
      provider: descriptor.platform.provider,
      target: descriptor.platform.target,
      settings: { ...descriptor.platform.settings },
      requiredServices: [...descriptor.platform.requiredServices].sort(compare)
    },
    assets: [...(plan.assets ?? [])].sort((left, right) => compare(left.path, right.path)),
    prerenders: [...(plan.prerenders ?? [])].sort((left, right) => compare(left.route, right.route)),
    headers: [...(plan.headers ?? [])].sort((left, right) =>
      compare(`${left.route}\0${left.name.toLowerCase()}\0${left.value}`, `${right.route}\0${right.name.toLowerCase()}\0${right.value}`)),
    redirects: [...(plan.redirects ?? [])].sort((left, right) => compare(left.source, right.source)),
    probes: probes.sort((left, right) => compare(`${left.kind}\0${left.name}`, `${right.kind}\0${right.name}`)),
    originRequirements: (plan.origins ?? []).map((origin) => ({
      origin: new URL(origin.origin).origin,
      purposes: [...new Set(origin.purposes)].sort(compare)
    })).sort((left, right) => compare(left.origin, right.origin)),
    environment: (plan.environment ?? []).map(({ name, required, secret }) => ({ name, required, secret }))
      .sort((left, right) => compare(left.name, right.name))
  };
  assertNoSecretLeak(manifest, plan);
  return manifest;
}

export function emitDeploymentManifest(manifest: DeploymentManifestV1): string {
  return `${canonicalJson(manifest)}\n`;
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => compare(left, right));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
}

function validateDescriptor(descriptor: ManifestAdapterDescriptorV1): void {
  if (!/^[a-z0-9@/._-]+$/u.test(descriptor.name) || descriptor.name.includes(".."))
    throw new DeploymentManifestValidationError("Adapter name is invalid.");
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(descriptor.version))
    throw new DeploymentManifestValidationError("Adapter version must be semantic.");
  if (!/^[a-z][a-z0-9-]*$/u.test(descriptor.platform.provider)
    || !/^[a-z][a-z0-9-]*$/u.test(descriptor.platform.target))
    throw new DeploymentManifestValidationError("Deployment platform is invalid.");
  if (["streaming", "sharedCache", "ppr", "imageOptimization"]
    .some((name) => typeof descriptor.capabilities[name as keyof AdapterCapabilitiesV1] !== "boolean"))
    throw new DeploymentManifestValidationError("Adapter capabilities must be explicit booleans.");
  for (const [key, value] of Object.entries(descriptor.platform.settings)) {
    if (!/^[a-z][A-Za-z0-9]*$/u.test(key)
      || /(?:secret|token|password|connectionString|privateKey)/iu.test(key)
      || typeof value === "string" && /[\p{Cc}]/u.test(value)
      || typeof value === "number" && !Number.isFinite(value))
      throw new DeploymentManifestValidationError("Deployment platform setting is invalid.");
  }
  if (new Set(descriptor.platform.requiredServices).size !== descriptor.platform.requiredServices.length
    || descriptor.platform.requiredServices.some((service) => !/^[a-z][a-z0-9-]*$/u.test(service)))
    throw new DeploymentManifestValidationError("Required platform service is invalid.");
}

function assertNoSecretLeak(manifest: DeploymentManifestV1, plan: DeploymentPlanV1): void {
  const serialized = canonicalJson(manifest);
  if (secretValues(plan).some((secret) => serialized.includes(secret)))
    throw new DeploymentManifestValidationError("A secret value would be emitted in the deployment manifest.");
}
