namespace DotReact.AspNetCore;

/// <summary>Persistence boundary for build-scoped prerendered artifacts.</summary>
public interface IDotReactPrerenderStore
{
    /// <summary>Gets an artifact by its exact build and path key.</summary>
    ValueTask<DotReactPrerenderArtifact?> GetAsync(
        DotReactPrerenderKey key,
        CancellationToken cancellationToken = default);

    /// <summary>Stores or replaces an artifact.</summary>
    ValueTask SetAsync(DotReactPrerenderArtifact artifact, CancellationToken cancellationToken = default);

    /// <summary>Invalidates one path within one build.</summary>
    ValueTask<bool> InvalidatePathAsync(
        DotReactPrerenderKey key,
        CancellationToken cancellationToken = default);

    /// <summary>Invalidates all artifacts carrying a tag within one build.</summary>
    ValueTask<int> InvalidateTagAsync(
        string buildId,
        string tag,
        CancellationToken cancellationToken = default);
}
