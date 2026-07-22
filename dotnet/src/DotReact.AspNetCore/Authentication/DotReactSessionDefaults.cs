namespace DotReact.AspNetCore.Authentication;

/// <summary>Stable names used by the DotReact cookie-session integration.</summary>
public static class DotReactSessionDefaults
{
    /// <summary>Default ASP.NET Core authentication scheme.</summary>
    public const string AuthenticationScheme = "DotReact.Session";

    /// <summary>Claim containing the opaque, server-generated session identifier.</summary>
    public const string SessionIdClaim = "sid";

    /// <summary>Claim containing the UTC issuance timestamp as invariant ticks.</summary>
    public const string IssuedAtClaim = "dotreact:session:issued-at";
}
