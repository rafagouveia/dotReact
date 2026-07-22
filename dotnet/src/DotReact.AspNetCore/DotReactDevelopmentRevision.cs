using System.Threading;

namespace DotReact.AspNetCore;

/// <summary>
/// Tracks successful application metadata updates so the development client can
/// request fresh server props without exposing the dotnet-watch browser socket.
/// </summary>
public static class DotReactDevelopmentRevision
{
    private static long _current;
    private static TaskCompletionSource<long>? _changed = CreateSignal();

    /// <summary>Monotonic revision of the active ASP.NET Core application.</summary>
    public static long Current => Interlocked.Read(ref _current);

    /// <summary>Waits until a successful metadata update advances the observed revision.</summary>
    public static ValueTask<long> WaitForChangeAsync(long observedRevision, CancellationToken cancellationToken = default)
    {
        lock (typeof(DotReactDevelopmentRevision))
        {
            var current = Current;
            if (current != observedRevision) return ValueTask.FromResult(current);
            return new ValueTask<long>((_changed ??= CreateSignal()).Task.WaitAsync(cancellationToken));
        }
    }

    /// <summary>Called by the generated metadata-update handler after Hot Reload.</summary>
    public static void UpdateApplication(Type[]? updatedTypes)
    {
        TaskCompletionSource<long> changed;
        long revision;
        lock (typeof(DotReactDevelopmentRevision))
        {
            revision = Interlocked.Increment(ref _current);
            changed = _changed ??= CreateSignal();
            _changed = CreateSignal();
        }
        changed.TrySetResult(revision);
    }

    /// <summary>Required metadata-update hook; DotReact has no static loader cache to clear.</summary>
    public static void ClearCache(Type[]? updatedTypes)
    {
    }

    private static TaskCompletionSource<long> CreateSignal() =>
        new(TaskCreationOptions.RunContinuationsAsynchronously);
}
