using System.Collections.Concurrent;

namespace DotReact.AspNetCore.Authentication;

/// <summary>
/// Single-process session store used by development and tests. Production scale-out should
/// replace it with the Redis adapter registered by DotReact.Redis.
/// </summary>
public sealed class InMemoryDotReactSessionStore(TimeProvider timeProvider) : IDotReactSessionStore
{
    private readonly ConcurrentDictionary<string, DotReactSessionRegistration> _sessions =
        new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, DateTimeOffset> _revokedBefore =
        new(StringComparer.Ordinal);

    /// <inheritdoc />
    public ValueTask RegisterAsync(
        DotReactSessionRegistration session,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(session);
        cancellationToken.ThrowIfCancellationRequested();
        if (!_sessions.TryAdd(session.SessionId, session))
            throw new InvalidOperationException("The generated session identifier already exists.");
        return ValueTask.CompletedTask;
    }

    /// <inheritdoc />
    public ValueTask<bool> IsActiveAsync(
        string sessionId,
        string subject,
        DateTimeOffset issuedAt,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!_sessions.TryGetValue(sessionId, out var session)) return ValueTask.FromResult(false);
        if (!string.Equals(session.Subject, subject, StringComparison.Ordinal)
            || session.IssuedAt != issuedAt
            || session.ExpiresAt <= timeProvider.GetUtcNow())
        {
            _sessions.TryRemove(sessionId, out _);
            return ValueTask.FromResult(false);
        }

        var active = !_revokedBefore.TryGetValue(subject, out var revokedAt) || issuedAt > revokedAt;
        return ValueTask.FromResult(active);
    }

    /// <inheritdoc />
    public ValueTask RevokeAsync(
        string sessionId,
        string subject,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (_sessions.TryGetValue(sessionId, out var session)
            && string.Equals(session.Subject, subject, StringComparison.Ordinal))
            _sessions.TryRemove(sessionId, out _);
        return ValueTask.CompletedTask;
    }

    /// <inheritdoc />
    public ValueTask RevokeAllAsync(
        string subject,
        DateTimeOffset revokedAt,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        _revokedBefore.AddOrUpdate(subject, revokedAt,
            (_, current) => current >= revokedAt ? current : revokedAt);
        return ValueTask.CompletedTask;
    }
}
