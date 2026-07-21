# Compatibility matrix

| DotReact | .NET | Node.js | React | Vite | TypeScript |
|---|---|---|---|---|---|
| 0.1.x experimental | 10.x | 24.x recommended; 22.19+ supported | 19.2.x | 8.1.x | 7.0.x |

Protocol version 1 is currently required on both sides. During the current
pre-release, generated projects vendor the runtime under `vendor/` and use
local `file:`/project references. After npm and NuGet publication, those
references will be replaced by packages pinned to the same DotReact minor
version. Every upgrade must regenerate contracts and pass `dotreact check`
before deployment.

Supported development hosts are Windows and Linux. The production container is
Linux-based and targets Azure App Service custom containers and Azure Container
Apps. macOS remains community-tested until CI coverage is added.
