export const DEPLOYMENT_ADAPTER_API_VERSION = "dotreact.deployment-adapter/v1" as const;

export interface AdapterCapabilitiesV1 {
  readonly streaming: boolean;
  readonly sharedCache: boolean;
  readonly ppr: boolean;
  readonly imageOptimization: boolean;
}

export type CapabilityRequirementsV1 = Partial<AdapterCapabilitiesV1>;

export interface DeploymentAssetV1 {
  /** Portable build-relative source path. */
  readonly source: string;
  /** Root-relative public destination. */
  readonly path: string;
  readonly cacheControl: string;
  readonly integrity?: string;
}

export interface DeploymentPrerenderV1 {
  readonly route: string;
  readonly assetPath: string;
  readonly mode: "static" | "ppr";
}

export interface DeploymentHeaderV1 {
  readonly route: string;
  readonly name: string;
  readonly value: string;
}

export interface DeploymentRedirectV1 {
  readonly source: string;
  readonly destination: string;
  readonly status: 301 | 302 | 307 | 308;
}

export interface DeploymentProbeV1 {
  readonly name: string;
  readonly kind: "startup" | "readiness" | "liveness";
  readonly path: string;
  readonly intervalSeconds: number;
  readonly timeoutSeconds: number;
}

export interface DeploymentOriginRequirementV1 {
  /** Exact HTTPS origin without credentials, path, query, or fragment. */
  readonly origin: string;
  readonly purposes: readonly ("api" | "assets" | "images")[];
}

export interface DeploymentEnvironmentBindingV1 {
  readonly name: string;
  readonly required: boolean;
  readonly secret: boolean;
  /** Available to deployment execution only and always omitted from manifests. */
  readonly value?: string;
}

export interface DeploymentPlanV1 {
  readonly requiredCapabilities?: CapabilityRequirementsV1;
  readonly assets?: readonly DeploymentAssetV1[];
  readonly prerenders?: readonly DeploymentPrerenderV1[];
  readonly headers?: readonly DeploymentHeaderV1[];
  readonly redirects?: readonly DeploymentRedirectV1[];
  readonly probes?: readonly DeploymentProbeV1[];
  readonly origins?: readonly DeploymentOriginRequirementV1[];
  readonly environment?: readonly DeploymentEnvironmentBindingV1[];
}

export interface DeploymentPlatformV1 {
  readonly provider: string;
  readonly target: string;
  readonly settings: Readonly<Record<string, string | number | boolean>>;
  readonly requiredServices: readonly string[];
}

export interface DeploymentManifestV1 {
  readonly apiVersion: typeof DEPLOYMENT_ADAPTER_API_VERSION;
  readonly adapter: {
    readonly name: string;
    readonly version: string;
  };
  readonly capabilities: AdapterCapabilitiesV1;
  readonly platform: DeploymentPlatformV1;
  readonly assets: readonly DeploymentAssetV1[];
  readonly prerenders: readonly DeploymentPrerenderV1[];
  readonly headers: readonly DeploymentHeaderV1[];
  readonly redirects: readonly DeploymentRedirectV1[];
  readonly probes: readonly DeploymentProbeV1[];
  readonly originRequirements: readonly DeploymentOriginRequirementV1[];
  readonly environment: readonly Omit<DeploymentEnvironmentBindingV1, "value">[];
}

export interface DeploymentAdapterV1 {
  readonly apiVersion: typeof DEPLOYMENT_ADAPTER_API_VERSION;
  readonly name: string;
  readonly version: string;
  readonly capabilities: AdapterCapabilitiesV1;
  createManifest(plan: DeploymentPlanV1): DeploymentManifestV1;
  emitManifest(plan: DeploymentPlanV1): string;
}
