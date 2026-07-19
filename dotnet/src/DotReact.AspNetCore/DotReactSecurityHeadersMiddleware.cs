using System.Text;
using DotReact.AspNetCore;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Primitives;

namespace Microsoft.AspNetCore.Builder;

/// <summary>Adds configurable security headers to DotReact responses and static assets.</summary>
public static class DotReactSecurityHeadersApplicationBuilderExtensions
{
    /// <summary>Adds the DotReact security-header middleware.</summary>
    public static IApplicationBuilder UseDotReactSecurityHeaders(this IApplicationBuilder app)
    {
        ArgumentNullException.ThrowIfNull(app);
        return app.UseMiddleware<DotReactSecurityHeadersMiddleware>();
    }
}

internal sealed class DotReactSecurityHeadersMiddleware(
    RequestDelegate next,
    IOptions<DotReactSecurityHeadersOptions> securityOptions,
    IOptions<DotReactOptions> dotReactOptions)
{
    public Task InvokeAsync(HttpContext context)
    {
        var security = securityOptions.Value;
        if (!security.Enabled) return next(context);

        var headers = context.Response.Headers;
        headers.TryAdd("X-Content-Type-Options", "nosniff");
        headers.TryAdd("X-XSS-Protection", "0");
        Add(headers, "X-Frame-Options", security.FrameOptions);
        Add(headers, "Referrer-Policy", security.ReferrerPolicy);
        Add(headers, "Permissions-Policy", security.PermissionsPolicy);
        Add(headers, "Cross-Origin-Opener-Policy", security.CrossOriginOpenerPolicy);
        if (security.ContentSecurityPolicyEnabled)
        {
            headers.TryAdd("Content-Security-Policy",
                security.ContentSecurityPolicy ?? BuildContentSecurityPolicy(security, dotReactOptions.Value));
        }
        return next(context);
    }

    private static void Add(IHeaderDictionary headers, string name, string? value)
    {
        if (value is not null) headers.TryAdd(name, new StringValues(value));
    }

    private static string BuildContentSecurityPolicy(
        DotReactSecurityHeadersOptions security,
        DotReactOptions dotReact)
    {
        var scriptSources = new List<string> { "'self'" };
        var styleSources = new List<string> { "'self'" };
        var connectSources = new List<string> { "'self'" };
        scriptSources.AddRange(security.AdditionalScriptSources);
        styleSources.AddRange(security.AdditionalStyleSources);
        connectSources.AddRange(security.AdditionalConnectSources);

        if (dotReact.Development)
        {
            AddDevelopmentOrigin(dotReact.ClientScriptSrc, scriptSources, styleSources, connectSources);
            AddDevelopmentOrigin(dotReact.ReactRefreshPreambleSrc, scriptSources, styleSources, connectSources);
            scriptSources.Add("'unsafe-inline'");
            styleSources.Add("'unsafe-inline'");
        }

        var policy = new StringBuilder();
        policy.Append("default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; ");
        AppendDirective(policy, "script-src", scriptSources);
        AppendDirective(policy, "style-src", styleSources);
        policy.Append("img-src 'self' data:; font-src 'self'; worker-src 'self'; ");
        AppendDirective(policy, "connect-src", connectSources);
        return policy.ToString().TrimEnd();
    }

    private static void AddDevelopmentOrigin(
        string? source,
        ICollection<string> scripts,
        ICollection<string> styles,
        ICollection<string> connections)
    {
        if (!Uri.TryCreate(source, UriKind.Absolute, out var uri)
            || (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)) return;
        var origin = uri.GetLeftPart(UriPartial.Authority);
        if (!scripts.Contains(origin, StringComparer.Ordinal)) scripts.Add(origin);
        if (!styles.Contains(origin, StringComparer.Ordinal)) styles.Add(origin);
        if (!connections.Contains(origin, StringComparer.Ordinal)) connections.Add(origin);
        var socketScheme = uri.Scheme == Uri.UriSchemeHttps ? "wss" : "ws";
        var socketOrigin = $"{socketScheme}://{uri.Authority}";
        if (!connections.Contains(socketOrigin, StringComparer.Ordinal)) connections.Add(socketOrigin);
    }

    private static void AppendDirective(StringBuilder policy, string name, IEnumerable<string> sources)
    {
        policy.Append(name).Append(' ').AppendJoin(' ', sources.Distinct(StringComparer.Ordinal)).Append("; ");
    }
}
