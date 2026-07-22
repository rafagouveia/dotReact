namespace DotReact.AspNetCore.Images;

/// <summary>Configures the bounded DotReact image optimization endpoint.</summary>
public sealed class DotReactImageOptions
{
    /// <summary>Endpoint path used by the React image component.</summary>
    public string EndpointPath { get; set; } = "/_dotreact/image";

    /// <summary>Optional absolute local root. Defaults to the host web root.</summary>
    public string? LocalRootPath { get; set; }

    /// <summary>Exact remote origins allowed as image sources. Empty is fail-closed.</summary>
    public ISet<string> AllowedRemoteOrigins { get; } = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

    /// <summary>Permitted output widths. Requests must match one of these values.</summary>
    public ISet<int> AllowedWidths { get; } = new HashSet<int>
    {
        32, 48, 64, 96, 128, 256, 320, 640, 960, 1280, 1920
    };

    /// <summary>Permitted encoded output formats.</summary>
    public ISet<DotReactImageFormat> AllowedFormats { get; } = new HashSet<DotReactImageFormat>
    {
        DotReactImageFormat.Jpeg,
        DotReactImageFormat.Png,
        DotReactImageFormat.Webp
    };

    /// <summary>Quality used when the request omits it.</summary>
    public int DefaultQuality { get; set; } = 75;
    /// <summary>Lowest accepted lossy quality.</summary>
    public int MinimumQuality { get; set; } = 40;
    /// <summary>Highest accepted lossy quality.</summary>
    public int MaximumQuality { get; set; } = 95;
    /// <summary>Maximum bytes read from any source.</summary>
    public long MaximumSourceBytes { get; set; } = 10 * 1024 * 1024;
    /// <summary>Maximum decoded pixel count.</summary>
    public long MaximumSourcePixels { get; set; } = 40_000_000;
    /// <summary>Browser and CDN cache duration.</summary>
    public TimeSpan ClientCacheDuration { get; set; } = TimeSpan.FromHours(1);
    /// <summary>End-to-end timeout for a remote source request.</summary>
    public TimeSpan RemoteRequestTimeout { get; set; } = TimeSpan.FromSeconds(10);
    /// <summary>Maximum image decodes or transforms executing concurrently in this process.</summary>
    public int MaxConcurrentTransforms { get; set; } = 4;
}

/// <summary>Supported browser-safe output encodings.</summary>
public enum DotReactImageFormat
{
    /// <summary>JPEG encoding.</summary>
    Jpeg,
    /// <summary>PNG encoding.</summary>
    Png,
    /// <summary>WebP encoding.</summary>
    Webp
}
