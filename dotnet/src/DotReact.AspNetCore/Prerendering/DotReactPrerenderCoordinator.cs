using System.Collections.Concurrent;

namespace DotReact.AspNetCore;

/// <summary>How a prerendered artifact was resolved.</summary>
public enum DotReactPrerenderResolution
{
    /// <summary>A fresh stored artifact was returned.</summary>
    Fresh,
    /// <summary>A missing or expired artifact was generated synchronously.</summary>
    Generated,
    /// <summary>A stale artifact was returned while one background regeneration runs.</summary>
    StaleWhileRevalidate,
    /// <summary>Regeneration failed and the last stored artifact was returned.</summary>
    StaleOnError
}

/// <summary>Artifact plus its cache resolution.</summary>
public sealed record DotReactPrerenderResult(
    DotReactPrerenderArtifact Artifact,
    DotReactPrerenderResolution Resolution);

/// <summary>Coordinates single-flight regeneration and stale-while-revalidate behavior.</summary>
public sealed class DotReactPrerenderCoordinator
{
    private readonly IDotReactPrerenderStore _store;
    private readonly TimeProvider _timeProvider;
    private readonly ConcurrentDictionary<DotReactPrerenderKey, Task<DotReactPrerenderArtifact>> _flights = [];

    /// <summary>Creates a coordinator over one persistence boundary.</summary>
    public DotReactPrerenderCoordinator(
        IDotReactPrerenderStore store,
        TimeProvider? timeProvider = null)
    {
        ArgumentNullException.ThrowIfNull(store);
        _store = store;
        _timeProvider = timeProvider ?? TimeProvider.System;
    }

    /// <summary>Gets a stored artifact or regenerates it according to its freshness timestamps.</summary>
    public async ValueTask<DotReactPrerenderResult> GetOrCreateAsync(
        DotReactPrerenderKey key,
        Func<CancellationToken, ValueTask<DotReactPrerenderArtifact>> factory,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(factory);
        var stored = await _store.GetAsync(key, cancellationToken).ConfigureAwait(false);
        var now = _timeProvider.GetUtcNow();
        if (stored is not null && now < stored.FreshUntil)
            return Result(stored, DotReactPrerenderResolution.Fresh);

        if (stored is not null && now < stored.StaleUntil)
        {
            _ = ObserveBackgroundAsync(GetOrStartRefresh(key, factory));
            return Result(stored, DotReactPrerenderResolution.StaleWhileRevalidate);
        }

        try
        {
            var generated = await GetOrStartRefresh(key, factory).WaitAsync(cancellationToken).ConfigureAwait(false);
            return Result(generated, DotReactPrerenderResolution.Generated);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            throw;
        }
        catch (Exception) when (stored is not null)
        {
            return Result(stored, DotReactPrerenderResolution.StaleOnError);
        }
    }

    private static DotReactPrerenderResult Result(
        DotReactPrerenderArtifact artifact,
        DotReactPrerenderResolution resolution)
    {
        DotReactTelemetry.RecordPrerenderResolution(resolution);
        return new DotReactPrerenderResult(artifact, resolution);
    }

    private Task<DotReactPrerenderArtifact> GetOrStartRefresh(
        DotReactPrerenderKey key,
        Func<CancellationToken, ValueTask<DotReactPrerenderArtifact>> factory)
    {
        while (true)
        {
            if (_flights.TryGetValue(key, out var existing)) return existing;
            var completion = new TaskCompletionSource<DotReactPrerenderArtifact>(
                TaskCreationOptions.RunContinuationsAsynchronously);
            if (_flights.TryAdd(key, completion.Task))
            {
                _ = ProduceAsync(key, factory, completion);
                return completion.Task;
            }
        }
    }

    private async Task ProduceAsync(
        DotReactPrerenderKey key,
        Func<CancellationToken, ValueTask<DotReactPrerenderArtifact>> factory,
        TaskCompletionSource<DotReactPrerenderArtifact> completion)
    {
        try
        {
            var artifact = await factory(CancellationToken.None).ConfigureAwait(false);
            if (artifact.Key != key)
            {
                throw new InvalidOperationException(
                    $"Prerender factory returned key '{artifact.Key.BuildId}:{artifact.Key.Path}' for requested key " +
                    $"'{key.BuildId}:{key.Path}'.");
            }

            await _store.SetAsync(artifact).ConfigureAwait(false);
            completion.TrySetResult(artifact);
        }
        catch (Exception exception)
        {
            completion.TrySetException(exception);
        }
        finally
        {
            _flights.TryRemove(new KeyValuePair<DotReactPrerenderKey, Task<DotReactPrerenderArtifact>>(
                key, completion.Task));
        }
    }

    private static async Task ObserveBackgroundAsync(Task task)
    {
        try
        {
            await task.ConfigureAwait(false);
        }
        catch
        {
            // The stale artifact remains available; a later request may retry regeneration.
        }
    }
}
