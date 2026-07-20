namespace DotReact.AspNetCore;

/// <summary>Production stylesheets and JavaScript modules required by one route.</summary>
public sealed record DotReactClientRouteAssets(
    IReadOnlyList<string> Styles,
    IReadOnlyList<string> ModulePreloads);

/// <summary>Configures the ASP.NET Core host and its renderer connection.</summary>
public sealed class DotReactOptions
{
    /// <summary>Base URL of the DotReact renderer service.</summary>
    public Uri RendererUrl { get; set; } = new("http://127.0.0.1:5178", UriKind.Absolute);

    /// <summary>Optional shared token sent as a Bearer authorization token.</summary>
    public string? RendererToken { get; set; }

    /// <summary>Fails startup unless a renderer token with sufficient entropy is configured.</summary>
    public bool RequireRendererToken { get; set; }

    /// <summary>Enables development diagnostics. Never enable this in production.</summary>
    public bool Development { get; set; }

    /// <summary>Maximum duration of a renderer request.</summary>
    public TimeSpan RequestTimeout { get; set; } = TimeSpan.FromSeconds(10);

    /// <summary>Number of transport retries after the initial renderer connection attempt.</summary>
    public int RendererRetryCount { get; set; } = 4;

    /// <summary>Initial delay used by the bounded exponential renderer retry policy.</summary>
    public TimeSpan RendererRetryDelay { get; set; } = TimeSpan.FromMilliseconds(125);

    /// <summary>Maximum time allowed for each renderer connection attempt.</summary>
    public TimeSpan RendererConnectTimeout { get; set; } = TimeSpan.FromMilliseconds(750);

    /// <summary>Streams the React document shell and Suspense boundaries when the renderer supports protocol v2.</summary>
    public bool EnableStreaming { get; set; }

    /// <summary>Immutable deployment identifier used to isolate SSG and ISR artifacts.</summary>
    public string PrerenderBuildId { get; set; } = "development";

    /// <summary>Maximum number of paths exposed by one prerender manifest request.</summary>
    public int MaxStaticPaths { get; set; } = 10_000;

    /// <summary>
    /// Maximum serialized page-props payload accepted for SSR, hydration and client navigation.
    /// This prevents accidentally transferring an unbounded application graph to React.
    /// </summary>
    public int MaxSerializedPropsBytes { get; set; } = 512 * 1024;

    /// <summary>Collects dependency-free browser Web Vitals through the framework telemetry endpoint.</summary>
    public bool EnableBrowserVitals { get; set; } = true;

    /// <summary>Same-origin endpoint receiving bounded browser performance samples.</summary>
    public string BrowserVitalsEndpointPath { get; set; } = "/_dotreact/vitals";

    /// <summary>Browser module that hydrates the server-rendered page.</summary>
    public string ClientScriptSrc { get; set; } = "/_dotreact/client.js";

    /// <summary>
    /// Optional stylesheet loaded in the document head before server-rendered HTML is painted.
    /// Configure the Vite source in development and the extracted bundle in production.
    /// </summary>
    public string? ClientStyleSrc { get; set; }

    /// <summary>
    /// Optional route-aware stylesheet URL template. The literal <c>{moduleKey}</c>
    /// is replaced with a Base64URL page module identifier. This lets the
    /// development renderer put modular route CSS in the head before first paint.
    /// </summary>
    public string? ClientRouteStyleSrc { get; set; }

    /// <summary>
    /// Build-generated route assets. The framework emits these before SSR HTML so
    /// route CSS cannot flash late and the initial route module starts downloading early.
    /// </summary>
    public IReadOnlyDictionary<string, DotReactClientRouteAssets> ClientRouteAssets { get; set; }
        = new Dictionary<string, DotReactClientRouteAssets>(StringComparer.Ordinal);

    /// <summary>
    /// Vite React Refresh runtime module. When set in development, DotReact installs
    /// the preamble before loading the client entry so Fast Refresh can register modules.
    /// </summary>
    public string? ReactRefreshPreambleSrc { get; set; }

    /// <summary>
    /// Optional same-origin endpoint polled in development to refresh server props
    /// after .NET Hot Reload or reload the document after the process restarts.
    /// </summary>
    public string? DevelopmentRuntimeProbePath { get; set; }

    /// <summary>DOM id of the React application root.</summary>
    public string RootElementId { get; set; } = "root";
}
