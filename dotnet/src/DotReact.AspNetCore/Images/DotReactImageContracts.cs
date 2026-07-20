namespace DotReact.AspNetCore.Images;

/// <summary>Contains bounded source bytes and a non-secret cache identity.</summary>
public sealed record DotReactImageSource
{
    /// <summary>Creates a validated source value.</summary>
    public DotReactImageSource(byte[] content, string identity) => (Content, Identity) = (content, identity);
    /// <summary>Source image bytes.</summary>
    public byte[] Content { get; }
    /// <summary>Stable source identity that must not contain its URL or filesystem path.</summary>
    public string Identity { get; }
}

/// <summary>Describes one validated image transformation.</summary>
public sealed record DotReactImageTransform
{
    /// <summary>Creates a validated transform.</summary>
    public DotReactImageTransform(int width, int quality, DotReactImageFormat format) =>
        (Width, Quality, Format) = (width, quality, format);
    /// <summary>Maximum output width.</summary>
    public int Width { get; }
    /// <summary>Lossy encoder quality.</summary>
    public int Quality { get; }
    /// <summary>Output raster format.</summary>
    public DotReactImageFormat Format { get; }
}

/// <summary>Contains encoded image bytes and their media type.</summary>
public sealed record DotReactOptimizedImage
{
    /// <summary>Creates an encoded image result.</summary>
    public DotReactOptimizedImage(byte[] content, string contentType) => (Content, ContentType) = (content, contentType);
    /// <summary>Encoded response bytes.</summary>
    public byte[] Content { get; }
    /// <summary>Browser-safe image media type.</summary>
    public string ContentType { get; }
}

/// <summary>Reads a validated local or remote source without exposing its location to the endpoint.</summary>
public interface IDotReactImageSourceReader
{
    /// <summary>Reads an allowed source with configured byte limits.</summary>
    Task<DotReactImageSource> ReadAsync(string source, CancellationToken cancellationToken);
}

/// <summary>Transforms a bounded source into a browser-safe raster format.</summary>
public interface IDotReactImageProcessor
{
    /// <summary>Transforms a validated source according to bounded parameters.</summary>
    Task<DotReactOptimizedImage> ProcessAsync(
        DotReactImageSource source,
        DotReactImageTransform transform,
        CancellationToken cancellationToken);
}

/// <summary>Represents a safe client-facing image request failure.</summary>
public sealed class DotReactImageRequestException(int statusCode, string message) : Exception(message)
{
    /// <summary>HTTP status returned by the endpoint.</summary>
    public int StatusCode { get; } = statusCode;
}
