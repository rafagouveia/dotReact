using System.Collections.Concurrent;

namespace DotReact.AspNetCore;

/// <summary>Bounds for the in-process least-recently-used prerender store.</summary>
public sealed class DotReactMemoryPrerenderStoreOptions
{
    /// <summary>Maximum number of artifacts retained.</summary>
    public int MaxEntries { get; set; } = 1_000;

    /// <summary>Maximum approximate UTF-8 payload size retained.</summary>
    public long MaxBytes { get; set; } = 64 * 1024 * 1024;
}

/// <summary>Thread-safe, bounded, least-recently-used in-memory prerender store.</summary>
public sealed class DotReactMemoryPrerenderStore : IDotReactPrerenderStore
{
    private readonly object _gate = new();
    private readonly int _maxEntries;
    private readonly long _maxBytes;
    private readonly ConcurrentDictionary<DotReactPrerenderKey, Entry> _entries = [];
    private long _sizeBytes;
    private long _accessSequence;

    /// <summary>Creates a bounded store.</summary>
    public DotReactMemoryPrerenderStore(DotReactMemoryPrerenderStoreOptions? options = null)
    {
        options ??= new DotReactMemoryPrerenderStoreOptions();
        if (options.MaxEntries <= 0) throw new ArgumentOutOfRangeException(nameof(options.MaxEntries));
        if (options.MaxBytes <= 0) throw new ArgumentOutOfRangeException(nameof(options.MaxBytes));
        _maxEntries = options.MaxEntries;
        _maxBytes = options.MaxBytes;
    }

    /// <inheritdoc />
    public ValueTask<DotReactPrerenderArtifact?> GetAsync(
        DotReactPrerenderKey key,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!_entries.TryGetValue(key, out var entry))
        {
            DotReactTelemetry.RecordCacheOperation("prerender-memory", "miss");
            return ValueTask.FromResult<DotReactPrerenderArtifact?>(null);
        }
        entry.Touch(Interlocked.Increment(ref _accessSequence));
        DotReactTelemetry.RecordCacheOperation("prerender-memory", "hit");
        return ValueTask.FromResult<DotReactPrerenderArtifact?>(entry.Artifact);
    }

    /// <inheritdoc />
    public ValueTask SetAsync(DotReactPrerenderArtifact artifact, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(artifact);
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate)
        {
            Remove(artifact.Key);
            if (artifact.SizeBytes > _maxBytes)
            {
                DotReactTelemetry.RecordCacheOperation("prerender-memory", "skip-oversize");
                return ValueTask.CompletedTask;
            }

            while (_entries.Count >= _maxEntries || _sizeBytes + artifact.SizeBytes > _maxBytes)
            {
                var oldest = _entries.MinBy(pair => pair.Value.LastAccess);
                if (oldest.Equals(default(KeyValuePair<DotReactPrerenderKey, Entry>))) break;
                Remove(oldest.Key);
                DotReactTelemetry.RecordCacheOperation("prerender-memory", "evict-lru");
            }

            _entries[artifact.Key] = new Entry(artifact, Interlocked.Increment(ref _accessSequence));
            _sizeBytes += artifact.SizeBytes;
            DotReactTelemetry.RecordCacheOperation("prerender-memory", "write");
        }

        return ValueTask.CompletedTask;
    }

    /// <inheritdoc />
    public ValueTask<bool> InvalidatePathAsync(
        DotReactPrerenderKey key,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate)
        {
            var removed = Remove(key);
            if (removed) DotReactTelemetry.RecordCacheOperation("prerender-memory", "invalidate-path");
            return ValueTask.FromResult(removed);
        }
    }

    /// <inheritdoc />
    public ValueTask<int> InvalidateTagAsync(
        string buildId,
        string tag,
        CancellationToken cancellationToken = default)
    {
        buildId = DotReactPrerenderValidation.ValidateBuildId(buildId);
        var normalizedTag = DotReactPrerenderValidation.NormalizeTags([tag]).Single();
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate)
        {
            var keys = _entries.Where(pair => pair.Key.BuildId == buildId &&
                    pair.Value.Artifact.Tags.Contains(normalizedTag, StringComparer.Ordinal))
                .Select(pair => pair.Key).ToArray();
            foreach (var key in keys) Remove(key);
            if (keys.Length > 0)
                DotReactTelemetry.RecordCacheOperation("prerender-memory", "invalidate-tag", keys.Length);
            return ValueTask.FromResult(keys.Length);
        }
    }

    private bool Remove(DotReactPrerenderKey key)
    {
        if (!_entries.TryRemove(key, out var entry)) return false;
        _sizeBytes -= entry.Artifact.SizeBytes;
        return true;
    }

    private sealed class Entry(DotReactPrerenderArtifact artifact, long lastAccess)
    {
        private long _lastAccess = lastAccess;

        public DotReactPrerenderArtifact Artifact { get; } = artifact;

        public long LastAccess => Volatile.Read(ref _lastAccess);

        public void Touch(long sequence) => Volatile.Write(ref _lastAccess, sequence);
    }
}
