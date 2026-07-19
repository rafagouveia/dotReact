namespace DotReact.AspNetCore;

/// <summary>Configures response security headers emitted by DotReact middleware.</summary>
public sealed class DotReactSecurityHeadersOptions
{
    /// <summary>Enables all configured headers.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>Enables Content-Security-Policy.</summary>
    public bool ContentSecurityPolicyEnabled { get; set; } = true;

    /// <summary>Optional complete CSP override. Leave null to use the safe generated policy.</summary>
    public string? ContentSecurityPolicy { get; set; }

    /// <summary>Additional CSP script sources, such as a trusted static asset CDN.</summary>
    public IList<string> AdditionalScriptSources { get; } = [];

    /// <summary>Additional CSP style sources.</summary>
    public IList<string> AdditionalStyleSources { get; } = [];

    /// <summary>Additional CSP connect sources.</summary>
    public IList<string> AdditionalConnectSources { get; } = [];

    /// <summary>Value for X-Frame-Options. Set null to omit it.</summary>
    public string? FrameOptions { get; set; } = "DENY";

    /// <summary>Value for Referrer-Policy. Set null to omit it.</summary>
    public string? ReferrerPolicy { get; set; } = "no-referrer";

    /// <summary>Value for Permissions-Policy. Set null to omit it.</summary>
    public string? PermissionsPolicy { get; set; } = "camera=(), microphone=(), geolocation=()";

    /// <summary>Value for Cross-Origin-Opener-Policy. Set null when popup interoperability is required.</summary>
    public string? CrossOriginOpenerPolicy { get; set; } = "same-origin";
}
