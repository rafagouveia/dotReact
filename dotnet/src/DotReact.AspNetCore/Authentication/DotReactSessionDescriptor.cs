using System.Security.Claims;

namespace DotReact.AspNetCore.Authentication;

/// <summary>Trusted identity data mapped to an authenticated browser session.</summary>
public sealed record DotReactSessionDescriptor(
    string Subject,
    string DisplayName,
    IReadOnlyCollection<Claim> Claims,
    bool Persistent = false,
    TimeSpan? Lifetime = null);

/// <summary>Server-side registration used to validate and revoke a cookie session.</summary>
public sealed record DotReactSessionRegistration(
    string SessionId,
    string Subject,
    DateTimeOffset IssuedAt,
    DateTimeOffset ExpiresAt);
