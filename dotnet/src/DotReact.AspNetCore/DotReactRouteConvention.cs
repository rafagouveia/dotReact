namespace DotReact.AspNetCore;

/// <summary>Maps canonical DRX module IDs to ASP.NET Core route patterns.</summary>
public static class DotReactRouteConvention
{
    /// <summary>
    /// Converts <c>page</c>, <c>products/[id]/page</c> and
    /// <c>docs/[...slug]/page</c> to their ASP.NET Core route patterns.
    /// Parenthesized route-group segments are omitted from the URL.
    /// </summary>
    public static string InferPattern(string moduleId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(moduleId);
        if (moduleId.Length > 512 || moduleId.Contains('\\', StringComparison.Ordinal))
            throw Invalid(moduleId);

        var segments = moduleId.Split('/');
        if (segments.Length == 0 || segments[^1] != "page" || segments.Any(string.IsNullOrWhiteSpace))
            throw Invalid(moduleId);

        var route = new List<string>(segments.Length - 1);
        var parameters = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var segment in segments[..^1])
        {
            if (IsRouteGroup(segment))
                continue;

            if (TryParameter(segment, out var name, out var catchAll))
            {
                if (!parameters.Add(name))
                    throw new ArgumentException($"DotReact route parameter '{name}' is duplicated in module ID '{moduleId}'.", nameof(moduleId));
                route.Add(catchAll ? $"{{**{name}}}" : $"{{{name}}}");
                continue;
            }

            if (!IsStaticSegment(segment))
                throw Invalid(moduleId);
            route.Add(segment);
        }

        return route.Count == 0 ? "/" : "/" + string.Join('/', route);
    }

    private static bool IsRouteGroup(string segment) =>
        segment.Length > 2 && segment[0] == '(' && segment[^1] == ')'
        && IsIdentifier(segment[1..^1]);

    private static bool TryParameter(string segment, out string name, out bool catchAll)
    {
        catchAll = segment.StartsWith("[...", StringComparison.Ordinal) && segment.EndsWith(']');
        var simple = segment.StartsWith('[') && segment.EndsWith(']') && !catchAll;
        name = catchAll ? segment[4..^1] : simple ? segment[1..^1] : string.Empty;
        return (simple || catchAll) && IsIdentifier(name);
    }

    private static bool IsIdentifier(string value) =>
        value.Length > 0 && (char.IsLetter(value[0]) || value[0] == '_')
        && value.All(character => char.IsLetterOrDigit(character) || character == '_');

    private static bool IsStaticSegment(string value) =>
        value is not "." and not ".." && value.Length > 0
        && char.IsLetterOrDigit(value[0])
        && value.All(character => char.IsLetterOrDigit(character) || character is '.' or '_' or '-');

    private static ArgumentException Invalid(string moduleId) =>
        new($"DotReact page module ID '{moduleId}' is not canonical. Expected 'page' or '<segments>/page'.", nameof(moduleId));
}
