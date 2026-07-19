using Microsoft.Extensions.Options;

namespace Microsoft.Extensions.DependencyInjection;

using DotReact.AspNetCore;

/// <summary>Registers configurable DotReact security headers.</summary>
public static class DotReactSecurityHeadersServiceCollectionExtensions
{
    /// <summary>Registers safe response-header defaults.</summary>
    public static IServiceCollection AddDotReactSecurityHeaders(
        this IServiceCollection services,
        Action<DotReactSecurityHeadersOptions>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(services);
        var options = services.AddOptions<DotReactSecurityHeadersOptions>();
        if (configure is not null) options.Configure(configure);
        options.Validate(static value => IsSafe(value.ContentSecurityPolicy)
                && IsSafe(value.FrameOptions)
                && IsSafe(value.ReferrerPolicy)
                && IsSafe(value.PermissionsPolicy)
                && IsSafe(value.CrossOriginOpenerPolicy)
                && value.AdditionalScriptSources.All(IsSafeSource)
                && value.AdditionalStyleSources.All(IsSafeSource)
                && value.AdditionalConnectSources.All(IsSafeSource),
            "DotReact security header values are invalid or contain control characters.")
            .ValidateOnStart();
        return services;
    }

    private static bool IsSafe(string? value) => value is null || !value.ContainsAny('\r', '\n');

    private static bool IsSafeSource(string value) =>
        !string.IsNullOrWhiteSpace(value) && value.IndexOfAny(['\r', '\n', ';', ' ', '\t']) < 0;
}
