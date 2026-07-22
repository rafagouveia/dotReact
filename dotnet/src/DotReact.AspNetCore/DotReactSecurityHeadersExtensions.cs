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
                && value.AdditionalScriptSources.All(static source => IsExactOrigin(source, allowWebSocket: false))
                && value.AdditionalStyleSources.All(static source => IsExactOrigin(source, allowWebSocket: false))
                && value.AdditionalConnectSources.All(static source => IsExactOrigin(source, allowWebSocket: true)),
            "DotReact security headers must be free of control characters and additional sources must be exact HTTPS/WSS origins.")
            .ValidateOnStart();
        return services;
    }

    private static bool IsSafe(string? value) => value is null || !value.ContainsAny('\r', '\n');

    private static bool IsExactOrigin(string value, bool allowWebSocket)
    {
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri)
            || string.IsNullOrWhiteSpace(uri.Host)
            || !string.IsNullOrEmpty(uri.UserInfo)
            || uri.AbsolutePath != "/"
            || !string.IsNullOrEmpty(uri.Query)
            || !string.IsNullOrEmpty(uri.Fragment))
            return false;
        return uri.Scheme == Uri.UriSchemeHttps
            || (allowWebSocket && uri.Scheme.Equals("wss", StringComparison.OrdinalIgnoreCase));
    }
}
