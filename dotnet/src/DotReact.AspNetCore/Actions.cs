namespace DotReact.AspNetCore;

/// <summary>Executes an explicitly discovered server action.</summary>
public interface IDotReactAction<TRequest, TResponse>
{
    /// <summary>Executes the action for a deserialized request.</summary>
    ValueTask<DotReactActionResult<TResponse>> ExecuteAsync(
        TRequest request,
        CancellationToken cancellationToken);
}

/// <summary>Opts an action type into discovery under a stable client-visible ID.</summary>
[AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = false)]
public sealed class DotReactActionAttribute(string id) : Attribute
{
    /// <summary>The stable route ID used by generated clients.</summary>
    public string Id { get; } = id;
}

/// <summary>
/// Requires callers of an action to provide an idempotency key. Concurrent and repeated
/// requests with the same action, caller scope, key and payload replay the first response.
/// </summary>
[AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = false)]
public sealed class DotReactIdempotentAttribute : Attribute
{
    /// <summary>Creates an idempotency policy using the default retention period.</summary>
    public DotReactIdempotentAttribute() { }

    /// <summary>Creates an idempotency policy with an explicit retention period.</summary>
    public DotReactIdempotentAttribute(int retentionSeconds)
    {
        if (retentionSeconds is < 1 or > 86_400)
            throw new ArgumentOutOfRangeException(nameof(retentionSeconds), "Retention must be between 1 second and 24 hours.");
        RetentionSeconds = retentionSeconds;
    }

    /// <summary>Optional retention override. Zero uses the configured default.</summary>
    public int RetentionSeconds { get; }
}

/// <summary>The supported server-action outcome kinds.</summary>
public enum DotReactActionResultKind
{
    /// <summary>The operation succeeded.</summary>
    Success,
    /// <summary>Input validation failed.</summary>
    Validation,
    /// <summary>The requested resource was not found.</summary>
    NotFound,
    /// <summary>The operation conflicted with current state.</summary>
    Conflict
}

/// <summary>A closed set of HTTP outcomes supported by a DotReact action.</summary>
public sealed record DotReactActionResult<TResponse>
{
    /// <summary>The result discriminator.</summary>
    public DotReactActionResultKind Kind { get; private init; }
    /// <summary>The successful response value.</summary>
    public TResponse? Value { get; private init; }
    /// <summary>Validation errors keyed by input member.</summary>
    public IReadOnlyDictionary<string, string[]>? Errors { get; private init; }
    /// <summary>An optional safe client-facing explanation.</summary>
    public string? Detail { get; private init; }
    /// <summary>Local application paths whose data became stale after a successful action.</summary>
    public IReadOnlyList<string> RevalidatePaths { get; private init; } = [];

    /// <summary>Creates a successful result.</summary>
    public static DotReactActionResult<TResponse> Success(
        TResponse value,
        IEnumerable<string>? revalidatePaths = null) =>
        new()
        {
            Kind = DotReactActionResultKind.Success,
            Value = value,
            RevalidatePaths = ValidateRevalidationPaths(revalidatePaths)
        };

    /// <summary>Creates a validation failure.</summary>
    public static DotReactActionResult<TResponse> Validation(
        IReadOnlyDictionary<string, string[]> errors,
        string? detail = null) =>
        new() { Kind = DotReactActionResultKind.Validation, Errors = errors, Detail = detail };

    /// <summary>Creates a not-found result.</summary>
    public static DotReactActionResult<TResponse> NotFound(string? detail = null) =>
        new() { Kind = DotReactActionResultKind.NotFound, Detail = detail };

    /// <summary>Creates a conflict result.</summary>
    public static DotReactActionResult<TResponse> Conflict(string? detail = null) =>
        new() { Kind = DotReactActionResultKind.Conflict, Detail = detail };

    private static IReadOnlyList<string> ValidateRevalidationPaths(IEnumerable<string>? paths)
    {
        if (paths is null) return [];
        var result = paths.Distinct(StringComparer.Ordinal).ToArray();
        if (result.Length > 32)
            throw new ArgumentException("At most 32 revalidation paths are supported.", nameof(paths));
        foreach (var path in result)
        {
            if (path.Length is 0 or > 2_048 || path[0] != '/' || path.StartsWith("//", StringComparison.Ordinal)
                || path.Contains('\\') || path.Any(char.IsControl))
                throw new ArgumentException("Revalidation paths must be bounded local application paths.", nameof(paths));
        }
        return result;
    }
}
