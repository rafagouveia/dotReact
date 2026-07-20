using System.Globalization;
using DotReact.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using StackExchange.Redis;

namespace DotReact.Redis;

/// <summary>Cross-replica session registration and revocation backed by Redis.</summary>
public sealed class RedisDotReactSessionStore : IDotReactSessionStore
{
    private const string RevokeOneScript = """
        if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
        return 0
        """;
    private const string RevokeAllScript = """
        local current = redis.call('GET', KEYS[1])
        if (not current) or (tonumber(current) < tonumber(ARGV[1])) then
          redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
          return 1
        end
        return 0
        """;
    private readonly IDatabase _database;
    private readonly RedisKeyCodec _keys;
    private readonly DotReactRedisOptions _options;
    private readonly TimeProvider _timeProvider;

    /// <summary>Creates the Redis-backed session store.</summary>
    public RedisDotReactSessionStore(
        IConnectionMultiplexer connection,
        IOptions<DotReactRedisOptions> options,
        TimeProvider timeProvider)
    {
        _database = connection.GetDatabase();
        _keys = new RedisKeyCodec(options);
        _options = options.Value;
        _timeProvider = timeProvider;
    }

    /// <inheritdoc />
    public async ValueTask RegisterAsync(
        DotReactSessionRegistration session,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(session);
        cancellationToken.ThrowIfCancellationRequested();
        var lifetime = session.ExpiresAt - _timeProvider.GetUtcNow();
        if (lifetime <= TimeSpan.Zero)
            throw new ArgumentOutOfRangeException(nameof(session), "The session is already expired.");
        var stored = await _database.StringSetAsync(
            _keys.Session(session.SessionId),
            _keys.SessionSubject(session.Subject),
            lifetime,
            When.NotExists).WaitAsync(cancellationToken).ConfigureAwait(false);
        if (!stored) throw new InvalidOperationException("The generated session identifier already exists.");
    }

    /// <inheritdoc />
    public async ValueTask<bool> IsActiveAsync(
        string sessionId,
        string subject,
        DateTimeOffset issuedAt,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var values = await _database.StringGetAsync([
            (RedisKey)_keys.Session(sessionId),
            (RedisKey)_keys.SessionRevokedBefore(subject)
        ]).WaitAsync(cancellationToken).ConfigureAwait(false);
        if (!values[0].HasValue
            || !string.Equals(values[0].ToString(), _keys.SessionSubject(subject), StringComparison.Ordinal))
            return false;
        if (!values[1].HasValue) return true;
        return !long.TryParse(values[1].ToString(), NumberStyles.None, CultureInfo.InvariantCulture,
                   out var revokedTicks)
               || issuedAt.UtcTicks > revokedTicks;
    }

    /// <inheritdoc />
    public async ValueTask RevokeAsync(
        string sessionId,
        string subject,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        await _database.ScriptEvaluateAsync(
            RevokeOneScript,
            [(RedisKey)_keys.Session(sessionId)],
            [_keys.SessionSubject(subject)]).WaitAsync(cancellationToken).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async ValueTask RevokeAllAsync(
        string subject,
        DateTimeOffset revokedAt,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        await _database.ScriptEvaluateAsync(
            RevokeAllScript,
            [(RedisKey)_keys.SessionRevokedBefore(subject)],
            [revokedAt.UtcTicks.ToString(CultureInfo.InvariantCulture),
                (long)_options.SessionRevocationRetention.TotalMilliseconds])
            .WaitAsync(cancellationToken).ConfigureAwait(false);
    }
}
