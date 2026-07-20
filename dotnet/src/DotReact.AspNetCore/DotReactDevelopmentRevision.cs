using System.Threading;

namespace DotReact.AspNetCore;

/// <summary>
/// Tracks successful application metadata updates so the development client can
/// request fresh server props without exposing the dotnet-watch browser socket.
/// </summary>
public static class DotReactDevelopmentRevision
{
    private static long _current;

    /// <summary>Monotonic revision of the active ASP.NET Core application.</summary>
    public static long Current => Interlocked.Read(ref _current);

    /// <summary>Called by the generated metadata-update handler after Hot Reload.</summary>
    public static void UpdateApplication(Type[]? updatedTypes) => Interlocked.Increment(ref _current);

    /// <summary>Required metadata-update hook; DotReact has no static loader cache to clear.</summary>
    public static void ClearCache(Type[]? updatedTypes)
    {
    }
}
