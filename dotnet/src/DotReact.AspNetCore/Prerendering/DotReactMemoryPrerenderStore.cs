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
    private readonly Dictionary<DotReactPrerenderKey, Entry> _entries = [];
    private readonly LinkedList<DotReactPrerenderKey> _leastRecentlyUsed = [];
    private long _sizeBytes;

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
        lock (_gate)
        {
            if (!_entries.TryGetValue(key, out var entry))
                return ValueTask.FromResult<DotReactPrerenderArtifact?>(null);
            Touch(entry);
            return ValueTask.FromResult<DotReactPrerenderArtifact?>(entry.Artifact);
        }
    }

    /// <inheritdoc />
    public ValueTask SetAsync(DotReactPrerenderArtifact artifact, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(artifact);
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate)
        {
            Remove(artifact.Key);
            if (artifact.SizeBytes > _maxBytes) return ValueTask.CompletedTask;

            while (_entries.Count >= _maxEntries || _sizeBytes + artifact.SizeBytes > _maxBytes)
            {
                var oldest = _leastRecentlyUsed.Last;
                if (oldest is null) break;
                Remove(oldest.Value);
            }

            var node = _leastRecentlyUsed.AddFirst(artifact.Key);
            _entries.Add(artifact.Key, new Entry(artifact, node));
            _sizeBytes += artifact.SizeBytes;
        }

        return ValueTask.CompletedTask;
    }

    /// <inheritdoc />
    public ValueTask<bool> InvalidatePathAsync(
        DotReactPrerenderKey key,
        CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        lock (_gate) return ValueTask.FromResult(Remove(key));
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
            return ValueTask.FromResult(keys.Length);
        }
    }

    private void Touch(Entry entry)
    {
        _leastRecentlyUsed.Remove(entry.Node);
        _leastRecentlyUsed.AddFirst(entry.Node);
    }

    private bool Remove(DotReactPrerenderKey key)
    {
        if (!_entries.Remove(key, out var entry)) return false;
        _leastRecentlyUsed.Remove(entry.Node);
        _sizeBytes -= entry.Artifact.SizeBytes;
        return true;
    }

    private sealed record Entry(DotReactPrerenderArtifact Artifact, LinkedListNode<DotReactPrerenderKey> Node);
}
