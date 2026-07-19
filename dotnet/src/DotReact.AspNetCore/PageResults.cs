using Microsoft.AspNetCore.Http;

namespace DotReact.AspNetCore;

internal enum DotReactPageResultKind
{
    Page,
    NotFound,
    Redirect
}

/// <summary>A controlled HTTP outcome returned by a DotReact page loader.</summary>
public sealed class DotReactPageResult<TProps>
{
    private DotReactPageResult(
        DotReactPageResultKind kind,
        TProps? props,
        int statusCode,
        string? location)
    {
        Kind = kind;
        Props = props;
        StatusCode = statusCode;
        Location = location;
    }

    internal DotReactPageResultKind Kind { get; }
    internal TProps? Props { get; }
    internal int StatusCode { get; }
    internal string? Location { get; }

    /// <summary>Renders the supplied props with a body-compatible, non-redirect HTTP status.</summary>
    public static DotReactPageResult<TProps> Page(TProps props, int statusCode = 200)
    {
        if (!IsPageStatus(statusCode))
            throw new ArgumentOutOfRangeException(nameof(statusCode), statusCode,
                "A DotReact page status must be 200-599, must include a response body and cannot be a redirect.");

        return new(DotReactPageResultKind.Page, props, statusCode, null);
    }

    /// <summary>Returns a 404 rendered by the nearest React not-found boundary.</summary>
    public static DotReactPageResult<TProps> NotFound() =>
        new(DotReactPageResultKind.NotFound, default, StatusCodes.Status404NotFound, null);

    /// <summary>Redirects to a local absolute path using 307 or 308 and does not invoke the renderer.</summary>
    public static DotReactPageResult<TProps> Redirect(string location, bool permanent = false)
    {
        ValidateLocalLocation(location);
        return new(
            DotReactPageResultKind.Redirect,
            default,
            permanent ? StatusCodes.Status308PermanentRedirect : StatusCodes.Status307TemporaryRedirect,
            location);
    }

    private static bool IsPageStatus(int statusCode) =>
        statusCode is >= 200 and <= 599
        && statusCode is not StatusCodes.Status204NoContent
        && statusCode is not StatusCodes.Status205ResetContent
        && statusCode is not StatusCodes.Status304NotModified
        && statusCode is not (>= 300 and <= 399);

    private static void ValidateLocalLocation(string location)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(location);
        if (location[0] != '/'
            || location.StartsWith("//", StringComparison.Ordinal)
            || location.Contains('\\')
            || location.Any(char.IsControl))
        {
            throw new ArgumentException(
                "DotReact redirects must target a local absolute path beginning with one '/'.",
                nameof(location));
        }
    }
}
