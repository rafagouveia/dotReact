import type {
  AdapterCapabilitiesV1,
  CapabilityRequirementsV1,
  DeploymentPlanV1
} from "./contract.js";

const capabilityNames = ["streaming", "sharedCache", "ppr", "imageOptimization"] as const;
const sensitiveName = /(?:^|_)(?:api_?key|password|passwd|secret|token|connection_?string|private_?key)(?:$|_)/iu;

export class DeploymentManifestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeploymentManifestValidationError";
  }
}

export class CapabilityMismatchError extends DeploymentManifestValidationError {
  readonly missing: readonly (keyof AdapterCapabilitiesV1)[];

  constructor(missing: readonly (keyof AdapterCapabilitiesV1)[]) {
    super(`Deployment adapter is missing required capabilities: ${missing.join(", ")}.`);
    this.name = "CapabilityMismatchError";
    this.missing = Object.freeze([...missing]);
  }
}

export function validateCapabilities(
  capabilities: AdapterCapabilitiesV1,
  requirements: CapabilityRequirementsV1 = {}
): void {
  const missing = capabilityNames.filter((name) => requirements[name] === true && capabilities[name] !== true);
  if (missing.length > 0) throw new CapabilityMismatchError(missing);
  if (requirements.ppr === true && requirements.sharedCache !== true) {
    throw new DeploymentManifestValidationError("PPR requires sharedCache to be explicitly required.");
  }
}

function safeRoute(value: string, label: string): void {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || /[\p{Cc}]/u.test(value)) {
    throw new DeploymentManifestValidationError(`${label} must be a safe root-relative path.`);
  }
  const pathname = value.split(/[?#]/u, 1)[0] ?? "";
  if (pathname.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new DeploymentManifestValidationError(`${label} cannot contain traversal segments.`);
  }
}

function portableSource(value: string): void {
  if (value === "" || value.startsWith("/") || value.includes("\\") || /^[A-Za-z]:/u.test(value)
    || value.split("/").some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new DeploymentManifestValidationError("Asset source must be a portable build-relative path.");
  }
}

function safeHeader(name: string, value: string): void {
  if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(name) || /[\r\n]/u.test(value)) {
    throw new DeploymentManifestValidationError("Header name or value is invalid.");
  }
}

function exactHttpsOrigin(value: string): void {
  let url: URL;
  try { url = new URL(value); } catch { throw new DeploymentManifestValidationError("Origin requirement must be an exact HTTPS origin."); }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "" || url.pathname !== "/"
    || url.search !== "" || url.hash !== "") {
    throw new DeploymentManifestValidationError("Origin requirement must be an exact HTTPS origin.");
  }
}

export function validatePlan(plan: DeploymentPlanV1, capabilities: AdapterCapabilitiesV1): void {
  validateCapabilities(capabilities, plan.requiredCapabilities);
  for (const asset of plan.assets ?? []) {
    portableSource(asset.source);
    safeRoute(asset.path, "Asset path");
    if (/\p{Cc}/u.test(asset.cacheControl) || asset.cacheControl === "")
      throw new DeploymentManifestValidationError("Asset cacheControl is invalid.");
    if (asset.integrity !== undefined && !/^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}$/u.test(asset.integrity))
      throw new DeploymentManifestValidationError("Asset integrity must be a supported SRI value.");
  }
  for (const prerender of plan.prerenders ?? []) {
    safeRoute(prerender.route, "Prerender route");
    safeRoute(prerender.assetPath, "Prerender asset path");
    if (prerender.mode === "ppr" && !capabilities.ppr)
      throw new CapabilityMismatchError(["ppr"]);
  }
  for (const header of plan.headers ?? []) {
    safeRoute(header.route, "Header route");
    safeHeader(header.name, header.value);
  }
  for (const redirect of plan.redirects ?? []) {
    safeRoute(redirect.source, "Redirect source");
    if (redirect.destination.startsWith("/")) safeRoute(redirect.destination, "Redirect destination");
    else exactHttpsUrl(redirect.destination, "Redirect destination");
  }
  for (const probe of plan.probes ?? []) {
    if (!/^[a-z][a-z0-9-]{0,62}$/u.test(probe.name))
      throw new DeploymentManifestValidationError("Probe name is invalid.");
    safeRoute(probe.path, "Probe path");
    if (!Number.isInteger(probe.intervalSeconds) || probe.intervalSeconds < 1 || probe.intervalSeconds > 300
      || !Number.isInteger(probe.timeoutSeconds) || probe.timeoutSeconds < 1 || probe.timeoutSeconds > 60
      || probe.timeoutSeconds > probe.intervalSeconds)
      throw new DeploymentManifestValidationError("Probe timing is invalid.");
  }
  for (const origin of plan.origins ?? []) {
    exactHttpsOrigin(origin.origin);
    if (origin.purposes.length === 0 || origin.purposes.some((purpose) => !["api", "assets", "images"].includes(purpose)))
      throw new DeploymentManifestValidationError("Origin purpose is invalid.");
  }
  for (const binding of plan.environment ?? []) {
    if (!/^[A-Z_][A-Z0-9_]{0,127}$/u.test(binding.name))
      throw new DeploymentManifestValidationError("Environment binding name is invalid.");
    if (binding.value?.includes("\0") === true)
      throw new DeploymentManifestValidationError("Environment binding value is invalid.");
  }
  rejectDuplicates(plan);
}

function exactHttpsUrl(value: string, label: string): void {
  let url: URL;
  try { url = new URL(value); } catch { throw new DeploymentManifestValidationError(`${label} must be root-relative or HTTPS.`); }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "")
    throw new DeploymentManifestValidationError(`${label} must be root-relative or HTTPS.`);
}

function rejectDuplicates(plan: DeploymentPlanV1): void {
  unique((plan.assets ?? []).map((item) => item.path), "asset path");
  unique((plan.prerenders ?? []).map((item) => item.route), "prerender route");
  unique((plan.headers ?? []).map((item) => `${item.route}\0${item.name.toLowerCase()}`), "header rule");
  unique((plan.redirects ?? []).map((item) => item.source), "redirect source");
  unique((plan.probes ?? []).map((item) => item.name), "probe name");
  unique((plan.environment ?? []).map((item) => item.name), "environment binding");
  unique((plan.origins ?? []).map((item) => new URL(item.origin).origin.toLowerCase()), "origin requirement");
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length)
    throw new DeploymentManifestValidationError(`Duplicate ${label}.`);
}

export function secretValues(plan: DeploymentPlanV1): readonly string[] {
  return (plan.environment ?? [])
    .filter((binding) => binding.secret || sensitiveName.test(binding.name))
    .map((binding) => binding.value)
    .filter((value): value is string => value !== undefined && value.length >= 4);
}

export function redactDeploymentDiagnostics(value: unknown, plan: DeploymentPlanV1): unknown {
  const secrets = [...secretValues(plan)].sort((left, right) => right.length - left.length);
  const visit = (current: unknown, key?: string): unknown => {
    if (key !== undefined && sensitiveName.test(key)) return "[REDACTED]";
    if (typeof current === "string")
      return secrets.reduce((text, secret) => text.replaceAll(secret, "[REDACTED]"), current);
    if (Array.isArray(current)) return current.map((item) => visit(item));
    if (current !== null && typeof current === "object")
      return Object.fromEntries(Object.entries(current).map(([name, item]) => [name, visit(item, name)]));
    return current;
  };
  return visit(value);
}
