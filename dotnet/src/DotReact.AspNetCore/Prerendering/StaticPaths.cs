using System.Collections.ObjectModel;

namespace DotReact.AspNetCore;

/// <summary>Supplies build-time route values for one dynamic page type.</summary>
/// <typeparam name="TPage">The discovered DotReact page implementation.</typeparam>
public interface IDotReactStaticPathProvider<TPage> where TPage : class
{
    /// <summary>Returns the finite set of route values to prerender.</summary>
    IAsyncEnumerable<DotReactStaticPath> GetPathsAsync(CancellationToken cancellationToken);
}

internal interface IDotReactStaticPathSource
{
    Type PageType { get; }
    IAsyncEnumerable<DotReactStaticPath> GetPathsAsync(CancellationToken cancellationToken);
}

internal sealed class DotReactStaticPathSource<TPage>(IDotReactStaticPathProvider<TPage> provider)
    : IDotReactStaticPathSource where TPage : class
{
    public Type PageType => typeof(TPage);

    public IAsyncEnumerable<DotReactStaticPath> GetPathsAsync(CancellationToken cancellationToken) =>
        provider.GetPathsAsync(cancellationToken);
}

/// <summary>Route values and optional tags for one statically generated dynamic path.</summary>
public sealed class DotReactStaticPath
{
    /// <summary>Creates a validated static-path description.</summary>
    public DotReactStaticPath(
        IReadOnlyDictionary<string, string> routeValues,
        IEnumerable<string>? tags = null)
    {
        ArgumentNullException.ThrowIfNull(routeValues);
        var copy = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (name, value) in routeValues)
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(name);
            ArgumentNullException.ThrowIfNull(value);
            if (value.Any(char.IsControl))
                throw new ArgumentException($"Route value '{name}' contains control characters.", nameof(routeValues));
            if (!copy.TryAdd(name, value))
                throw new ArgumentException($"Route value '{name}' was provided more than once.", nameof(routeValues));
        }

        if (copy.Count == 0)
            throw new ArgumentException("At least one route value is required for a dynamic static path.", nameof(routeValues));

        RouteValues = new ReadOnlyDictionary<string, string>(copy);
        Tags = DotReactPrerenderValidation.NormalizeTags(tags);
    }

    /// <summary>Route parameter names and their unescaped values.</summary>
    public IReadOnlyDictionary<string, string> RouteValues { get; }

    /// <summary>Normalized tags added to the generated artifact.</summary>
    public IReadOnlyList<string> Tags { get; }
}
