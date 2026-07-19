using System.Collections.Concurrent;
using Microsoft.Extensions.Options;

namespace DotReact.AspNetCore;

/// <summary>Controls action request and replay resource limits.</summary>
public sealed class DotReactActionOptions
{
    /// <summary>Largest accepted JSON or form action body.</summary>
    public int MaxRequestBodyBytes { get; set; } = 256 * 1024;
    /// <summary>Largest response retained for idempotent replay.</summary>
    public int MaxReplayBodyBytes { get; set; } = 512 * 1024;
    /// <summary>Maximum number of completed or in-flight replay entries.</summary>
    public int MaxIdempotencyEntries { get; set; } = 1_024;
    /// <summary>Maximum accepted idempotency-key length.</summary>
    public int MaxIdempotencyKeyLength { get; set; } = 128;
    /// <summary>Default replay retention for an idempotent action.</summary>
    public TimeSpan IdempotencyRetention { get; set; } = TimeSpan.FromMinutes(10);
}

/// <summary>An immutable HTTP action response suitable for byte-for-byte replay.</summary>
public sealed record DotReactStoredActionResponse(
    int StatusCode,
    string ContentType,
    byte[] Body,
    IReadOnlyList<string> RevalidatePaths);

/// <summary>The result of an idempotency lookup or execution.</summary>
public sealed record DotReactIdempotencyOutcome(
    DotReactStoredActionResponse? Response,
    bool Replayed,
    bool FingerprintConflict);

/// <summary>Stores completed action responses behind caller-scoped idempotency keys.</summary>
public interface IDotReactActionIdempotencyStore
{
    /// <summary>Executes once or replays a previous response for an identical request.</summary>
    ValueTask<DotReactIdempotencyOutcome> ExecuteAsync(
        string scope,
        string key,
        string requestFingerprint,
        TimeSpan retention,
        Func<CancellationToken, ValueTask<DotReactStoredActionResponse>> operation,
        CancellationToken cancellationToken);
}

internal sealed class DotReactIdempotencyCapacityException : Exception
{
    public DotReactIdempotencyCapacityException() : base("The bounded DotReact idempotency store is at capacity.") { }
}

internal sealed class InMemoryDotReactActionIdempotencyStore(
    IOptions<DotReactActionOptions> options,
    TimeProvider timeProvider) : IDotReactActionIdempotencyStore
{
    private readonly ConcurrentDictionary<string, Entry> _entries = new(StringComparer.Ordinal);
    private readonly object _admissionLock = new();
    private readonly DotReactActionOptions _options = options.Value;

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

        var cacheKey = scope + "\n" + key;
        while (true)
        {
            var now = timeProvider.GetUtcNow();
            if (_entries.TryGetValue(cacheKey, out var existing))
            {
                if (existing.ExpiresAt <= now)
                {
                    _entries.TryRemove(new KeyValuePair<string, Entry>(cacheKey, existing));
                    continue;
                }
                if (!string.Equals(existing.Fingerprint, requestFingerprint, StringComparison.Ordinal))
                    return new DotReactIdempotencyOutcome(null, false, true);

                var replay = await existing.Response.Value.WaitAsync(cancellationToken).ConfigureAwait(false);
                return new DotReactIdempotencyOutcome(replay, true, false);
            }

            Entry created;
            lock (_admissionLock)
            {
                RemoveExpired(now);
                if (_entries.Count >= _options.MaxIdempotencyEntries)
                    RemoveOldestCompleted();
                if (_entries.Count >= _options.MaxIdempotencyEntries)
                    throw new DotReactIdempotencyCapacityException();

                created = new Entry(
                    requestFingerprint,
                    now,
                    now + retention,
                    new Lazy<Task<DotReactStoredActionResponse>>(
                        () => operation(cancellationToken).AsTask(),
                        LazyThreadSafetyMode.ExecutionAndPublication));
                if (!_entries.TryAdd(cacheKey, created)) continue;
            }

            try
            {
                var response = await created.Response.Value.WaitAsync(cancellationToken).ConfigureAwait(false);
                if (response.Body.Length > _options.MaxReplayBodyBytes)
                    _entries.TryRemove(new KeyValuePair<string, Entry>(cacheKey, created));
                return new DotReactIdempotencyOutcome(response, false, false);
            }
            catch
            {
                _entries.TryRemove(new KeyValuePair<string, Entry>(cacheKey, created));
                throw;
            }
        }
    }

    private void RemoveExpired(DateTimeOffset now)
    {
        foreach (var pair in _entries)
            if (pair.Value.ExpiresAt <= now)
                _entries.TryRemove(pair);
    }

    private void RemoveOldestCompleted()
    {
        var oldest = _entries.Where(pair => pair.Value.Response.IsValueCreated && pair.Value.Response.Value.IsCompleted)
            .OrderBy(pair => pair.Value.CreatedAt)
            .FirstOrDefault();
        if (!string.IsNullOrEmpty(oldest.Key)) _entries.TryRemove(oldest);
    }

    private sealed record Entry(
        string Fingerprint,
        DateTimeOffset CreatedAt,
        DateTimeOffset ExpiresAt,
        Lazy<Task<DotReactStoredActionResponse>> Response);
}
