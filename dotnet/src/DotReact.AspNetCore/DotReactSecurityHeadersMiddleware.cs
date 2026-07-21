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

internal sealed class DotReactSecurityHeadersMiddleware
{
    private readonly RequestDelegate _next;
    private readonly DotReactSecurityHeadersOptions _security;
    private readonly DotReactOptions _dotReact;
    private readonly string? _baseContentSecurityPolicy;

    public DotReactSecurityHeadersMiddleware(
        RequestDelegate next,
        IOptions<DotReactSecurityHeadersOptions> securityOptions,
        IOptions<DotReactOptions> dotReactOptions)
    {
        _next = next;
        _security = securityOptions.Value;
        _dotReact = dotReactOptions.Value;
        if (_security.Enabled && _security.ContentSecurityPolicyEnabled)
        {
            _baseContentSecurityPolicy = _security.ContentSecurityPolicy
                ?? BuildContentSecurityPolicy(_security, _dotReact, nonce: null);
        }
    }

    public Task InvokeAsync(HttpContext context)
    {
        var security = _security;
        if (!security.Enabled) return _next(context);

        DotReactSecurityNonce.Enable(context);

        var headers = context.Response.Headers;
        headers.TryAdd("X-Content-Type-Options", "nosniff");
        headers.TryAdd("X-XSS-Protection", "0");
        Add(headers, "X-Frame-Options", security.FrameOptions);
        Add(headers, "Referrer-Policy", security.ReferrerPolicy);
        Add(headers, "Permissions-Policy", security.PermissionsPolicy);
        Add(headers, "Cross-Origin-Opener-Policy", security.CrossOriginOpenerPolicy);
        if (security.ContentSecurityPolicyEnabled && security.ContentSecurityPolicy is not null)
        {
            headers.TryAdd("Content-Security-Policy", _baseContentSecurityPolicy);
        }
        else if (security.ContentSecurityPolicyEnabled)
        {
            context.Response.OnStarting(() =>
            {
                var nonce = DotReactSecurityNonce.Peek(context);
                headers.TryAdd("Content-Security-Policy", nonce is null
                    ? _baseContentSecurityPolicy
                    : BuildContentSecurityPolicy(security, _dotReact, nonce));
                return Task.CompletedTask;
            });
        }
        return _next(context);
    }

    private static void Add(IHeaderDictionary headers, string name, string? value)
    {
        if (value is not null) headers.TryAdd(name, new StringValues(value));
    }

    private static string BuildContentSecurityPolicy(
        DotReactSecurityHeadersOptions security,
        DotReactOptions dotReact,
        string? nonce)
    {
        var scriptSources = new List<string> { "'self'" };
        if (nonce is not null) scriptSources.Add($"'nonce-{nonce}'");
        var styleSources = new List<string> { "'self'" };
        var connectSources = new List<string> { "'self'" };
        var workerSources = new List<string> { "'self'" };
        scriptSources.AddRange(security.AdditionalScriptSources);
        styleSources.AddRange(security.AdditionalStyleSources);
        connectSources.AddRange(security.AdditionalConnectSources);

        if (dotReact.Development)
        {
            AddDevelopmentOrigin(dotReact.ClientScriptSrc, scriptSources, styleSources, connectSources);
            AddDevelopmentOrigin(dotReact.ClientStyleSrc, scriptSources, styleSources, connectSources);
            AddDevelopmentOrigin(dotReact.ReactRefreshPreambleSrc, scriptSources, styleSources, connectSources);
            // dotnet watch allocates an ephemeral localhost websocket port for browser refresh.
            // Keep this development-only; production remains restricted to configured origins.
            connectSources.Add("ws://localhost:*");
            connectSources.Add("wss://localhost:*");
            // Vite uses a short-lived blob worker while polling for a restarted dev server.
            workerSources.Add("blob:");
            scriptSources.Add("'unsafe-inline'");
            styleSources.Add("'unsafe-inline'");
        }

        var policy = new StringBuilder();
        policy.Append("default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; ");
        AppendDirective(policy, "script-src", scriptSources);
        AppendDirective(policy, "style-src", styleSources);
        // React style props compile to style attributes. CSP nonces do not apply to
        // attributes, so allow only that surface while keeping style elements external.
        policy.Append("style-src-attr 'unsafe-inline'; ");
        policy.Append("img-src 'self' data:; font-src 'self'; ");
        AppendDirective(policy, "worker-src", workerSources);
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
