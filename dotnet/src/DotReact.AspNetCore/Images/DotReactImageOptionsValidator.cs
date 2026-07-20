using Microsoft.Extensions.Options;

namespace DotReact.AspNetCore.Images;

internal sealed class DotReactImageOptionsValidator : IValidateOptions<DotReactImageOptions>
{
    public ValidateOptionsResult Validate(string? name, DotReactImageOptions options)
    {
        var failures = new List<string>();
        if (!options.EndpointPath.StartsWith('/') || options.EndpointPath.StartsWith("//", StringComparison.Ordinal)
            || options.EndpointPath.IndexOfAny(['?', '#', '\\', '\r', '\n']) >= 0)
            failures.Add("EndpointPath must be a safe application-relative path.");
        if (options.LocalRootPath is { } root && !Path.IsPathFullyQualified(root))
            failures.Add("LocalRootPath must be absolute when configured.");
        if (options.AllowedWidths.Count == 0 || options.AllowedWidths.Any(static width => width is < 1 or > 8192))
            failures.Add("AllowedWidths must contain values from 1 through 8192.");
        if (options.AllowedFormats.Count == 0 || options.AllowedFormats.Any(static format => !Enum.IsDefined(format)))
            failures.Add("AllowedFormats must contain supported raster formats.");
        if (options.MinimumQuality is < 1 or > 100 || options.MaximumQuality is < 1 or > 100
            || options.MinimumQuality > options.MaximumQuality
            || options.DefaultQuality < options.MinimumQuality || options.DefaultQuality > options.MaximumQuality)
            failures.Add("Image quality bounds are invalid.");
        if (options.MaximumSourceBytes is < 1 or > 100 * 1024 * 1024)
            failures.Add("MaximumSourceBytes must be from 1 byte through 100 MiB.");
        if (options.MaximumSourcePixels is < 1 or > 100_000_000)
            failures.Add("MaximumSourcePixels must be from 1 through 100 million pixels.");
        if (options.ClientCacheDuration < TimeSpan.Zero || options.ClientCacheDuration > TimeSpan.FromDays(365))
            failures.Add("ClientCacheDuration must be from zero through 365 days.");
        if (options.RemoteRequestTimeout <= TimeSpan.Zero || options.RemoteRequestTimeout > TimeSpan.FromMinutes(1))
            failures.Add("RemoteRequestTimeout must be greater than zero and at most one minute.");
        foreach (var origin in options.AllowedRemoteOrigins)
        {
            if (!TryNormalizeRemoteOrigin(origin, out _))
                failures.Add($"Remote origin '{origin}' must be an exact HTTPS origin without credentials, path, query, or fragment.");
        }
        return failures.Count == 0 ? ValidateOptionsResult.Success : ValidateOptionsResult.Fail(failures);
    }

    internal static bool TryNormalizeRemoteOrigin(string value, out string origin)
    {
        origin = string.Empty;
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps
            || string.IsNullOrWhiteSpace(uri.Host) || !string.IsNullOrEmpty(uri.UserInfo)
            || uri.AbsolutePath != "/" || !string.IsNullOrEmpty(uri.Query) || !string.IsNullOrEmpty(uri.Fragment))
            return false;
        origin = uri.GetLeftPart(UriPartial.Authority);
        return true;
    }
}
