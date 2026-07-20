using Microsoft.AspNetCore.Http;

namespace DotReact.AspNetCore.Authentication;

/// <summary>Secure transport and lifetime conventions for application sessions.</summary>
public sealed class DotReactCookieSessionOptions
{
    /// <summary>Cookie authentication scheme used by the session manager.</summary>
    public string Scheme { get; set; } = DotReactSessionDefaults.AuthenticationScheme;

    /// <summary>Development cookie name. Production uses a __Host- prefixed cookie.</summary>
    public string DevelopmentCookieName { get; set; } = ".DotReact.Session";

    /// <summary>Production cookie name. It must use the __Host- prefix.</summary>
    public string ProductionCookieName { get; set; } = "__Host-DotReact.Session";

    /// <summary>Absolute lifetime of a session. Renewal explicitly rotates its identifier.</summary>
    public TimeSpan Lifetime { get; set; } = TimeSpan.FromHours(8);

    /// <summary>Route used for interactive authentication challenges.</summary>
    public PathString LoginPath { get; set; } = "/auth/login";

    /// <summary>Route used when an authenticated principal lacks permission.</summary>
    public PathString AccessDeniedPath { get; set; } = "/auth/forbidden";
}
