using System.Collections.ObjectModel;
using System.Text;

namespace DotReact.AspNetCore;

/// <summary>Build- and path-scoped key for a prerendered artifact.</summary>
public readonly record struct DotReactPrerenderKey
{
    /// <summary>Creates a validated key.</summary>
    public DotReactPrerenderKey(string buildId, string path)
    {
        BuildId = DotReactPrerenderValidation.ValidateBuildId(buildId);
        Path = DotReactPrerenderValidation.ValidatePath(path);
    }

    /// <summary>Immutable application build identifier.</summary>
    public string BuildId { get; }

    /// <summary>Canonical local path without query string or fragment.</summary>
    public string Path { get; }
}

/// <summary>
/// Immutable HTML artifact. It intentionally contains no response headers or cookies and rejects known antiforgery
/// markers so request-specific secrets cannot be persisted accidentally.
/// </summary>
public sealed class DotReactPrerenderArtifact
{
    private static readonly string[] ForbiddenMarkers =
    [
        "dotreact-csrf-token",
        "csrfToken",
        "antiforgery",
        "set-cookie"
    ];

    private DotReactPrerenderArtifact(
        DotReactPrerenderKey key,
        string html,
        DateTimeOffset generatedAt,
        DateTimeOffset freshUntil,
        DateTimeOffset staleUntil,
        IReadOnlyList<string> tags)
    {
        Key = key;
        Html = html;
        GeneratedAt = generatedAt;
        FreshUntil = freshUntil;
        StaleUntil = staleUntil;
        Tags = tags;
        SizeBytes = Encoding.UTF8.GetByteCount(html) + Encoding.UTF8.GetByteCount(key.BuildId) +
            Encoding.UTF8.GetByteCount(key.Path) + tags.Sum(Encoding.UTF8.GetByteCount);
    }

    /// <summary>Artifact key.</summary>
    public DotReactPrerenderKey Key { get; }

    /// <summary>Complete UTF-8 HTML document without request-specific antiforgery data.</summary>
    public string Html { get; }

    /// <summary>Generation timestamp.</summary>
    public DateTimeOffset GeneratedAt { get; }

    /// <summary>Timestamp until which the artifact is fresh.</summary>
    public DateTimeOffset FreshUntil { get; }

    /// <summary>Timestamp until which stale-while-revalidate applies.</summary>
    public DateTimeOffset StaleUntil { get; }

    /// <summary>Normalized invalidation tags.</summary>
    public IReadOnlyList<string> Tags { get; }

    /// <summary>Approximate bounded-store cost in UTF-8 bytes.</summary>
    public long SizeBytes { get; }

    /// <summary>Creates and validates an immutable artifact.</summary>
    public static DotReactPrerenderArtifact Create(
        DotReactPrerenderKey key,
        string html,
        DateTimeOffset generatedAt,
        TimeSpan? freshFor = null,
        TimeSpan? staleWhileRevalidateFor = null,
        IEnumerable<string>? tags = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(html);
        foreach (var marker in ForbiddenMarkers)
        {
            if (html.Contains(marker, StringComparison.OrdinalIgnoreCase))
            {
                throw new ArgumentException(
                    $"Prerendered HTML contains forbidden request-specific marker '{marker}'.", nameof(html));
            }
        }

        if (freshFor is { } fresh && fresh <= TimeSpan.Zero)
            throw new ArgumentOutOfRangeException(nameof(freshFor), "Fresh lifetime must be greater than zero.");
        var staleFor = staleWhileRevalidateFor ?? TimeSpan.Zero;
        if (staleFor < TimeSpan.Zero)
            throw new ArgumentOutOfRangeException(nameof(staleWhileRevalidateFor));

        var freshUntil = freshFor is null ? DateTimeOffset.MaxValue : AddClamped(generatedAt, freshFor.Value);
        var staleUntil = freshUntil == DateTimeOffset.MaxValue ? freshUntil : AddClamped(freshUntil, staleFor);
        return new DotReactPrerenderArtifact(
            key, html, generatedAt, freshUntil, staleUntil, DotReactPrerenderValidation.NormalizeTags(tags));
    }

    private static DateTimeOffset AddClamped(DateTimeOffset value, TimeSpan duration)
    {
        try
        {
            return value.Add(duration);
        }
        catch (ArgumentOutOfRangeException)
        {
            return DateTimeOffset.MaxValue;
        }
    }
}

internal static class DotReactPrerenderValidation
{
    internal static string ValidateBuildId(string buildId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(buildId);
        if (buildId.Length > 128 || buildId.Any(character =>
                !char.IsAsciiLetterOrDigit(character) && character is not '.' and not '_' and not '-'))
            throw new ArgumentException("Build ID must contain only ASCII letters, digits, '.', '_' or '-'.", nameof(buildId));
        return buildId;
    }

    internal static string ValidatePath(string path)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        var decoded = Uri.UnescapeDataString(path);
        if (path[0] != '/' || path.StartsWith("//", StringComparison.Ordinal) ||
            path.Contains('?') || path.Contains('#') || path.Any(char.IsControl) || decoded.Contains('\\') ||
            decoded.Split('/').Any(segment => segment is "." or ".."))
            throw new ArgumentException("Prerender path must be a canonical local path without query or fragment.", nameof(path));
        return path;
    }

    internal static IReadOnlyList<string> NormalizeTags(IEnumerable<string>? tags)
    {
        if (tags is null) return Array.Empty<string>();
        var normalized = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var tag in tags)
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(tag);
            if (tag.Length > 128 || tag.Any(char.IsControl))
                throw new ArgumentException("Prerender tags must be at most 128 characters and contain no controls.", nameof(tags));
            normalized.Add(tag);
        }

        return new ReadOnlyCollection<string>(normalized.ToArray());
    }
}
