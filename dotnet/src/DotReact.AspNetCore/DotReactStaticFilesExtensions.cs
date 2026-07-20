using System.Text.RegularExpressions;
using Microsoft.Extensions.FileProviders;
using Microsoft.AspNetCore.Http;

namespace Microsoft.AspNetCore.Builder;

/// <summary>Serves production assets with safe cache policies for stable and fingerprinted files.</summary>
public static partial class DotReactStaticFilesExtensions
{
    /// <summary>
    /// Serves static files. Fingerprinted Vite assets are immutable for one year;
    /// stable filenames are revalidated on every navigation.
    /// </summary>
    public static IApplicationBuilder UseDotReactStaticFiles(this IApplicationBuilder app)
        => UseDotReactStaticFiles(app, null);

    /// <summary>Serves static files from an explicit public directory.</summary>
    public static IApplicationBuilder UseDotReactStaticFiles(
        this IApplicationBuilder app,
        string? publicPath)
    {
        ArgumentNullException.ThrowIfNull(app);
        if (publicPath is not null && !Path.IsPathFullyQualified(publicPath))
            throw new ArgumentException("The DotReact public path must be absolute.", nameof(publicPath));
        IFileProvider? fileProvider = publicPath is null
            ? null
            : Directory.Exists(publicPath) ? new PhysicalFileProvider(publicPath) : new NullFileProvider();
        return app.UseStaticFiles(new StaticFileOptions
        {
            FileProvider = fileProvider,
            OnPrepareResponse = context =>
            {
                var immutable = FingerprintedAsset().IsMatch(context.File.Name);
                context.Context.Response.Headers.CacheControl = immutable
                    ? "public,max-age=31536000,immutable"
                    : "public,max-age=0,must-revalidate";
                context.Context.Response.Headers.Append("Vary", "Accept-Encoding");
            }
        });
    }

    [GeneratedRegex(@"-[A-Za-z0-9_-]{8,}\.(?:css|js|mjs|woff2?|png|jpe?g|webp|avif|svg)$",
        RegexOptions.CultureInvariant | RegexOptions.IgnoreCase)]
    private static partial Regex FingerprintedAsset();
}
