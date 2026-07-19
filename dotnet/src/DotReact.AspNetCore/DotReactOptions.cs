namespace DotReact.AspNetCore;

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

    /// <summary>Browser module that hydrates the server-rendered page.</summary>
    public string ClientScriptSrc { get; set; } = "/_dotreact/client.js";

    /// <summary>
    /// Vite React Refresh runtime module. When set in development, DotReact installs
    /// the preamble before loading the client entry so Fast Refresh can register modules.
    /// </summary>
    public string? ReactRefreshPreambleSrc { get; set; }

    /// <summary>DOM id of the React application root.</summary>
    public string RootElementId { get; set; } = "root";
}
