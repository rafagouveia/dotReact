using System.Text.Json;
using DotReact.AspNetCore;
using Microsoft.Extensions.Options;
using StackExchange.Redis;

namespace DotReact.Redis;

/// <summary>Redis-backed build-scoped SSG/ISR artifact store.</summary>
public sealed class RedisDotReactPrerenderStore : IDotReactPrerenderStore
{
    private const string StoreScript = """
        local ttl = tonumber(ARGV[2])
        if ttl < 0 then
          redis.call('SET', KEYS[1], ARGV[1])
        else
          redis.call('SET', KEYS[1], ARGV[1], 'PX', ttl)
        end
        for index = 2, #KEYS do
          local existed = redis.call('EXISTS', KEYS[index])
          redis.call('ZADD', KEYS[index], ARGV[3], ARGV[5])
          redis.call('ZREMRANGEBYSCORE', KEYS[index], '-inf', ARGV[4])
          if ttl < 0 then
            redis.call('PERSIST', KEYS[index])
          elseif existed == 0 then
            redis.call('PEXPIRE', KEYS[index], ttl)
          else
            local current = redis.call('PTTL', KEYS[index])
            if current >= 0 and current < ttl then redis.call('PEXPIRE', KEYS[index], ttl) end
          end
        end
        return 1
        """;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly IDatabase _database;
    private readonly RedisKeyCodec _keys;
    private readonly DotReactRedisOptions _options;
    private readonly TimeProvider _timeProvider;

    /// <summary>Creates the shared store.</summary>
    public RedisDotReactPrerenderStore(
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
    public async ValueTask<DotReactPrerenderArtifact?> GetAsync(
        DotReactPrerenderKey key,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var value = await _database.StringGetAsync(_keys.Artifact(key.BuildId, key.Path)).ConfigureAwait(false);
        if (value.IsNull) return null;
        var stored = JsonSerializer.Deserialize<StoredArtifact>((byte[])value!, JsonOptions)
            ?? throw new InvalidOperationException("Redis contained an invalid DotReact prerender artifact.");
        if (!string.Equals(stored.BuildId, key.BuildId, StringComparison.Ordinal)
            || !string.Equals(stored.Path, key.Path, StringComparison.Ordinal))
            throw new InvalidOperationException("Redis prerender artifact key did not match its payload.");
        return stored.ToArtifact();
    }

    /// <inheritdoc />
    public async ValueTask SetAsync(
        DotReactPrerenderArtifact artifact,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(artifact);
        cancellationToken.ThrowIfCancellationRequested();
        var key = (RedisKey)_keys.Artifact(artifact.Key.BuildId, artifact.Key.Path);
        var expiry = Expiry(artifact);
        var payload = JsonSerializer.SerializeToUtf8Bytes(StoredArtifact.From(artifact), JsonOptions);
        var keys = new RedisKey[] { key }
            .Concat(artifact.Tags.Select(tag => (RedisKey)_keys.Tag(artifact.Key.BuildId, tag)))
            .ToArray();
        var ttlMilliseconds = expiry is null ? -1 : Milliseconds(expiry.Value);
        var nowMilliseconds = _timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
        var expiresAtMilliseconds = expiry is null
            ? DateTimeOffset.MaxValue.ToUnixTimeMilliseconds()
            : checked(nowMilliseconds + ttlMilliseconds);
        var stored = (int)await _database.ScriptEvaluateAsync(
            StoreScript,
            keys,
            [payload, ttlMilliseconds, expiresAtMilliseconds, nowMilliseconds, key.ToString()])
            .ConfigureAwait(false);
        if (stored != 1) throw new RedisException("Redis could not store the DotReact prerender artifact.");
    }

    /// <inheritdoc />
    public async ValueTask<bool> InvalidatePathAsync(
        DotReactPrerenderKey key,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        return await _database.KeyDeleteAsync(_keys.Artifact(key.BuildId, key.Path)).ConfigureAwait(false);
    }

    /// <inheritdoc />
    public async ValueTask<int> InvalidateTagAsync(
        string buildId,
        string tag,
        CancellationToken cancellationToken = default)
    {
        _ = new DotReactPrerenderKey(buildId, "/");
        ArgumentException.ThrowIfNullOrWhiteSpace(tag);
        cancellationToken.ThrowIfCancellationRequested();
        var tagKey = (RedisKey)_keys.Tag(buildId, tag);
        var members = await _database.SortedSetRangeByRankAsync(tagKey).ConfigureAwait(false);
        var artifactKeys = members.Where(member => !member.IsNull).Select(member => (RedisKey)member.ToString()).ToArray();
        var removed = artifactKeys.Length == 0 ? 0 : await _database.KeyDeleteAsync(artifactKeys).ConfigureAwait(false);
        await _database.KeyDeleteAsync(tagKey).ConfigureAwait(false);
        return checked((int)removed);
    }

    private TimeSpan? Expiry(DotReactPrerenderArtifact artifact)
    {
        if (artifact.StaleUntil == DateTimeOffset.MaxValue) return _options.StaticArtifactRetention;
        var remaining = artifact.StaleUntil - _timeProvider.GetUtcNow() + _options.ArtifactRetentionAfterStale;
        return remaining > TimeSpan.Zero ? remaining : TimeSpan.FromSeconds(1);
    }

    private static long Milliseconds(TimeSpan value) => checked((long)Math.Ceiling(value.TotalMilliseconds));

    private sealed record StoredArtifact(
        string BuildId,
        string Path,
        string Html,
        DateTimeOffset GeneratedAt,
        DateTimeOffset FreshUntil,
        DateTimeOffset StaleUntil,
        string[] Tags)
    {
        public static StoredArtifact From(DotReactPrerenderArtifact artifact) => new(
            artifact.Key.BuildId, artifact.Key.Path, artifact.Html, artifact.GeneratedAt,
            artifact.FreshUntil, artifact.StaleUntil, artifact.Tags.ToArray());

        public DotReactPrerenderArtifact ToArtifact()
        {
            TimeSpan? fresh = FreshUntil == DateTimeOffset.MaxValue ? null : FreshUntil - GeneratedAt;
            var stale = StaleUntil == DateTimeOffset.MaxValue || FreshUntil == DateTimeOffset.MaxValue
                ? TimeSpan.Zero : StaleUntil - FreshUntil;
            return DotReactPrerenderArtifact.Create(
                new DotReactPrerenderKey(BuildId, Path), Html, GeneratedAt, fresh, stale, Tags);
        }
    }
}
