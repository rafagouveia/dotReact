using System.Text.RegularExpressions;
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
    {
        ArgumentNullException.ThrowIfNull(app);
        return app.UseStaticFiles(new StaticFileOptions
        {
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
