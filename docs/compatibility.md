# Compatibility matrix

| DotReact | .NET | Node.js | React | Vite | TypeScript |
|---|---|---|---|---|---|
| 0.1.x experimental | 10.x | 24.x recommended; 22.19+ supported | 19.2.x | 8.1.x | 7.0.x |

Buffered SSR uses protocol v1 and streaming SSR negotiates protocol v2. The C#
host and Node renderer must come from the same coordinated DotReact release;
unknown protocol versions fail closed instead of falling back silently.
Generated projects use private GitHub npm and NuGet packages pinned to the same exact DotReact version;
the local TypeGen tool is pinned to that version as well. `dotreact upgrade`
aligns those three surfaces without rewriting application source. Every upgrade
must regenerate contracts and pass `dotreact check` before deployment. A
one-time global launcher delegates to the exact CLI installed by each project.

Supported development hosts are Windows and Linux. The production container is
Linux-based and targets Azure App Service custom containers and Azure Container
Apps. macOS remains community-tested until CI coverage is added.
