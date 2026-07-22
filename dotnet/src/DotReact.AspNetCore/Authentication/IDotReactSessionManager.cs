using Microsoft.AspNetCore.Http;

namespace DotReact.AspNetCore.Authentication;

/// <summary>Maps authenticated use-case results to ASP.NET Core cookie sessions.</summary>
public interface IDotReactSessionManager
{
    /// <summary>Creates a new session and rotates any existing session identifier.</summary>
    ValueTask SignInAsync(
        HttpContext context,
        DotReactSessionDescriptor descriptor,
        CancellationToken cancellationToken = default);

    /// <summary>Revokes and deletes only the current browser session.</summary>
    ValueTask SignOutAsync(HttpContext context, CancellationToken cancellationToken = default);

    /// <summary>Rotates the current session after a privilege or identity change.</summary>
    ValueTask RenewAsync(
        HttpContext context,
        DotReactSessionDescriptor descriptor,
        CancellationToken cancellationToken = default);

    /// <summary>Revokes every session for a subject and signs out the current matching principal.</summary>
    ValueTask RevokeAllAsync(
        HttpContext context,
        string subject,
        CancellationToken cancellationToken = default);
}
