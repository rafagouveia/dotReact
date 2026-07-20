using DotReact.AspNetCore.Images;
using DotReact.Images.SkiaSharp;

namespace Microsoft.Extensions.DependencyInjection;

/// <summary>Registers the optional cross-platform SkiaSharp image processor.</summary>
public static class SkiaSharpServiceCollectionExtensions
{
    /// <summary>Adds the DotReact image pipeline with real resize and raster encoding.</summary>
    public static IServiceCollection AddDotReactSkiaSharpImages(
        this IServiceCollection services,
        Action<DotReactImageOptions>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(services);
        return services.AddDotReactImages<SkiaSharpDotReactImageProcessor>(configure);
    }
}
