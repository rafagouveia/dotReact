using Microsoft.AspNetCore.Authorization;

namespace DotReact.AspNetCore;

/// <summary>Validated prerender policy derived from a page type.</summary>
public sealed record DotReactPrerenderMetadata
{
    private DotReactPrerenderMetadata(
        Type pageType,
        TimeSpan? freshFor,
        TimeSpan staleWhileRevalidateFor,
        IReadOnlyList<string> tags)
    {
        PageType = pageType;
        FreshFor = freshFor;
        StaleWhileRevalidateFor = staleWhileRevalidateFor;
        Tags = tags;
        StaticPathProviderType = typeof(IDotReactStaticPathProvider<>).MakeGenericType(pageType);
    }

    /// <summary>The annotated page implementation type.</summary>
    public Type PageType { get; }

    /// <summary>Fresh lifetime, or <see langword="null"/> for build-scoped static generation.</summary>
    public TimeSpan? FreshFor { get; }

    /// <summary>How long stale content may be served while regeneration runs.</summary>
    public TimeSpan StaleWhileRevalidateFor { get; }

    /// <summary>Normalized tags inherited by generated artifacts.</summary>
    public IReadOnlyList<string> Tags { get; }

    /// <summary>The closed service type used to resolve dynamic static paths for this page.</summary>
    public Type StaticPathProviderType { get; }

    /// <summary>
    /// Creates validated metadata for an annotated page. Explicit authorization metadata is rejected because
    /// request-independent artifacts must never contain user-specific content.
    /// </summary>
    public static DotReactPrerenderMetadata Create(Type pageType, IEnumerable<object>? additionalMetadata = null)
    {
        ArgumentNullException.ThrowIfNull(pageType);
        var attribute = pageType.GetCustomAttributes(typeof(DotReactPrerenderAttribute), inherit: false)
            .Cast<DotReactPrerenderAttribute>().SingleOrDefault()
            ?? throw new InvalidOperationException(
                $"Page type '{pageType.FullName ?? pageType.Name}' is not annotated with [DotReactPrerender].");

        var authorization = pageType.GetCustomAttributes(inherit: true).OfType<IAuthorizeData>()
            .Concat(additionalMetadata?.OfType<IAuthorizeData>() ?? []);
        if (authorization.Any())
        {
            throw new InvalidOperationException(
                $"Authorized page '{pageType.FullName ?? pageType.Name}' cannot be prerendered.");
        }

        if (attribute.RevalidateSeconds < 0)
            throw new InvalidOperationException("RevalidateSeconds cannot be negative.");
        if (attribute.StaleWhileRevalidateSeconds < 0)
            throw new InvalidOperationException("StaleWhileRevalidateSeconds cannot be negative.");

        return new DotReactPrerenderMetadata(
            pageType,
            attribute.RevalidateSeconds == 0 ? null : TimeSpan.FromSeconds(attribute.RevalidateSeconds),
            TimeSpan.FromSeconds(attribute.StaleWhileRevalidateSeconds),
            DotReactPrerenderValidation.NormalizeTags(attribute.Tags));
    }
}
