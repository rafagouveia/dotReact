namespace DotReact.AspNetCore.Authentication;

/// <summary>Revocation boundary for current-device and all-device session invalidation.</summary>
public interface IDotReactSessionStore
{
    /// <summary>Registers a newly issued session.</summary>
    ValueTask RegisterAsync(DotReactSessionRegistration session, CancellationToken cancellationToken);

    /// <summary>Returns whether the exact session is still active.</summary>
    ValueTask<bool> IsActiveAsync(
        string sessionId,
        string subject,
        DateTimeOffset issuedAt,
        CancellationToken cancellationToken);

    /// <summary>Revokes one session without affecting the caller's other devices.</summary>
    ValueTask RevokeAsync(string sessionId, string subject, CancellationToken cancellationToken);

    /// <summary>Revokes every session issued for a subject at or before the operation.</summary>
    ValueTask RevokeAllAsync(string subject, DateTimeOffset revokedAt, CancellationToken cancellationToken);
}
