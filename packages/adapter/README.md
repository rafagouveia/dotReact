# `@rafagouveia/dotreact-adapter`

Versioned deployment adapter contracts for DotReact. The current API version is
`dotreact.deployment-adapter/v1`.

Adapters validate capabilities before emitting a canonical JSON manifest. The
manifest always contains assets, prerenders, headers, redirects, probes, origin
requirements, and environment variable declarations. Environment values are
execution-only and are never emitted.

```ts
import { createAzureDeploymentAdapter } from "@rafagouveia/dotreact-adapter/azure";

const adapter = createAzureDeploymentAdapter({
  target: "container-apps",
  sharedCache: "azure-managed-redis",
  enablePpr: true,
  imageOptimization: true
});

const json = adapter.emitManifest({
  requiredCapabilities: {
    streaming: true,
    sharedCache: true,
    ppr: true,
    imageOptimization: true
  }
});
```

Do not place credentials in assets, URLs, headers, redirects, platform settings,
or origin requirements. Declare environment bindings instead. Diagnostic values
can be passed through `redactDeploymentDiagnostics` before logging.
