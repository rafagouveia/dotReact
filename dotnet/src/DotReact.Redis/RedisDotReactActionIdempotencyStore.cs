using System.Text.Json;
using DotReact.AspNetCore;
using Microsoft.Extensions.Options;
using StackExchange.Redis;

namespace DotReact.Redis;

/// <summary>Redis-backed cross-replica Server Action idempotency store with renewable leases.</summary>
public sealed class RedisDotReactActionIdempotencyStore : IDotReactActionIdempotencyStore
{
    private const string AcquireScript = """
        if redis.call('EXISTS', KEYS[1]) == 1 then return 2 end
        if redis.call('SET', KEYS[2], ARGV[1], 'NX', 'PX', ARGV[2]) then return 1 end
        return 0
        """;
    private const string CompleteScript = """
        if redis.call('GET', KEYS[2]) == ARGV[1] then
          redis.call('SET', KEYS[1], ARGV[2], 'PX', ARGV[3])
          redis.call('DEL', KEYS[2])
          return 1
        end
        return 0
        """;
    private const string RenewScript = """
        if redis.call('GET', KEYS[1]) == ARGV[1] then
          redis.call('PEXPIRE', KEYS[1], ARGV[2])
          return 1
        end
        return 0
        """;
    private const string ReleaseScript = """
        if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
        return 0
        """;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly IDatabase _database;
    private readonly RedisKeyCodec _keys;
    private readonly DotReactRedisOptions _redisOptions;
    private readonly DotReactActionOptions _actionOptions;

    /// <summary>Creates the shared idempotency store.</summary>
    public RedisDotReactActionIdempotencyStore(
        IConnectionMultiplexer connection,
        IOptions<DotReactRedisOptions> redisOptions,
        IOptions<DotReactActionOptions> actionOptions)
    {
        _database = connection.GetDatabase();
        _keys = new RedisKeyCodec(redisOptions);
        _redisOptions = redisOptions.Value;
        _actionOptions = actionOptions.Value;
    }

    /// <inheritdoc />
    public async ValueTask<DotReactIdempotencyOutcome> ExecuteAsync(
        string scope,
        string key,
        string requestFingerprint,
        TimeSpan retention,
        Func<CancellationToken, ValueTask<DotReactStoredActionResponse>> operation,
        CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(scope);
        ArgumentException.ThrowIfNullOrWhiteSpace(key);
        ArgumentException.ThrowIfNullOrWhiteSpace(requestFingerprint);
        ArgumentNullException.ThrowIfNull(operation);
        if (retention <= TimeSpan.Zero) throw new ArgumentOutOfRangeException(nameof(retention));

        var resultKey = (RedisKey)_keys.IdempotencyResult(scope, key);
        var lockKey = (RedisKey)_keys.IdempotencyLock(scope, key);
        while (true)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var token = Guid.NewGuid().ToString("N");
            var status = (int)await _database.ScriptEvaluateAsync(
                AcquireScript,
                [resultKey, lockKey],
                [token, Milliseconds(_redisOptions.IdempotencyLockLease)]).ConfigureAwait(false);
            if (status == 2)
            {
                var replay = await ReadAsync(resultKey).ConfigureAwait(false);
                if (replay is null) continue;
                if (!string.Equals(replay.Fingerprint, requestFingerprint, StringComparison.Ordinal))
                    return new DotReactIdempotencyOutcome(null, false, true);
                return new DotReactIdempotencyOutcome(replay.ToResponse(), true, false);
            }
            if (status == 0)
            {
                await Task.Delay(_redisOptions.IdempotencyPollInterval, cancellationToken).ConfigureAwait(false);
                continue;
            }

            using var renewal = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            var renewalTask = RenewLeaseAsync(lockKey, token, renewal.Token);
            try
            {
                var response = await operation(cancellationToken).ConfigureAwait(false);
                if (response.Body.Length > _actionOptions.MaxReplayBodyBytes)
                    throw new InvalidOperationException(
                        $"Idempotent action response exceeds the {_actionOptions.MaxReplayBodyBytes} byte replay limit.");
                var stored = StoredResponse.From(requestFingerprint, response);
                var completed = (int)await _database.ScriptEvaluateAsync(
                    CompleteScript,
                    [resultKey, lockKey],
                    [token, JsonSerializer.SerializeToUtf8Bytes(stored, JsonOptions), Milliseconds(retention)])
                    .ConfigureAwait(false);
                if (completed != 1)
                    throw new RedisException("DotReact lost its Redis idempotency lease before committing the response.");
                return new DotReactIdempotencyOutcome(response, false, false);
            }
            catch
            {
                try { await _database.ScriptEvaluateAsync(ReleaseScript, [lockKey], [token]).ConfigureAwait(false); }
                catch (RedisException) { }
                throw;
            }
            finally
            {
                await renewal.CancelAsync().ConfigureAwait(false);
                try { await renewalTask.ConfigureAwait(false); }
                catch (OperationCanceledException) when (renewal.IsCancellationRequested) { }
                catch (RedisException) { }
            }
        }
    }

    private async Task RenewLeaseAsync(RedisKey lockKey, string token, CancellationToken cancellationToken)
    {
        var interval = TimeSpan.FromTicks(Math.Max(
            TimeSpan.FromMilliseconds(250).Ticks,
            _redisOptions.IdempotencyLockLease.Ticks / 3));
        while (true)
        {
            await Task.Delay(interval, cancellationToken).ConfigureAwait(false);
            var renewed = (int)await _database.ScriptEvaluateAsync(
                RenewScript,
                [lockKey],
                [token, Milliseconds(_redisOptions.IdempotencyLockLease)]).ConfigureAwait(false);
            if (renewed != 1) return;
        }
    }

    private async Task<StoredResponse?> ReadAsync(RedisKey resultKey)
    {
        var value = await _database.StringGetAsync(resultKey).ConfigureAwait(false);
        return value.IsNull ? null : JsonSerializer.Deserialize<StoredResponse>((byte[])value!, JsonOptions)
            ?? throw new InvalidOperationException("Redis contained an invalid DotReact idempotency response.");
    }

    private static long Milliseconds(TimeSpan value) => checked((long)Math.Ceiling(value.TotalMilliseconds));

    private sealed record StoredResponse(
        string Fingerprint,
        int StatusCode,
        string ContentType,
        byte[] Body,
        string[] RevalidatePaths)
    {
        public static StoredResponse From(string fingerprint, DotReactStoredActionResponse response) => new(
            fingerprint, response.StatusCode, response.ContentType, response.Body, response.RevalidatePaths.ToArray());

        public DotReactStoredActionResponse ToResponse() =>
            new(StatusCode, ContentType, Body, RevalidatePaths);
    }
}
