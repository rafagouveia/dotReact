namespace DotReact.AspNetCore;

/// <summary>Opts a page into static generation or incremental static regeneration.</summary>
[AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = false)]
public sealed class DotReactPrerenderAttribute : Attribute
{
    /// <summary>Creates a build-scoped artifact that remains fresh until explicitly invalidated.</summary>
    public DotReactPrerenderAttribute()
    {
    }

    /// <summary>Creates an artifact that becomes stale after the specified number of seconds.</summary>
    public DotReactPrerenderAttribute(int revalidateSeconds)
    {
        if (revalidateSeconds <= 0)
            throw new ArgumentOutOfRangeException(nameof(revalidateSeconds), "Revalidation must be greater than zero seconds.");
        RevalidateSeconds = revalidateSeconds;
    }

    /// <summary>Seconds before an artifact becomes stale. Zero means build-scoped static generation.</summary>
    public int RevalidateSeconds { get; }

    /// <summary>Seconds that a stale artifact may be served while regeneration runs.</summary>
    public int StaleWhileRevalidateSeconds { get; set; } = 60;

    /// <summary>Tags attached to every artifact generated for the page.</summary>
    public string[] Tags { get; set; } = [];
}
