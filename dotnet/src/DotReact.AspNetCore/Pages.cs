using System.ComponentModel;
using System.Globalization;
using Microsoft.AspNetCore.Http;

namespace DotReact.AspNetCore;

/// <summary>Loads the serializable props for a discovered DotReact page.</summary>
public interface IDotReactPage<TProps>
{
    /// <summary>Loads props for the current request.</summary>
    ValueTask<TProps> LoadAsync(DotReactPageContext context, CancellationToken cancellationToken);
}

/// <summary>Loads an explicit HTTP-aware result for a discovered DotReact page.</summary>
public interface IDotReactResultPage<TProps>
{
    /// <summary>Loads a page, not-found or local redirect result for the current request.</summary>
    ValueTask<DotReactPageResult<TProps>> LoadAsync(
        DotReactPageContext context,
        CancellationToken cancellationToken);
}

/// <summary>Opts a page type into discovery.</summary>
[AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = false)]
public sealed class DotReactPageAttribute : Attribute
{
    /// <summary>Uses an explicit ASP.NET Core route pattern.</summary>
    public DotReactPageAttribute(string pattern, string moduleId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(pattern);
        ArgumentException.ThrowIfNullOrWhiteSpace(moduleId);
        Pattern = pattern;
        ModuleId = moduleId;
    }

    /// <summary>Infers the ASP.NET Core route from a canonical page module ID.</summary>
    public DotReactPageAttribute(string moduleId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(moduleId);
        ModuleId = moduleId;
        Pattern = DotReactRouteConvention.InferPattern(moduleId);
    }

    /// <summary>Route pattern mapped by endpoint routing.</summary>
    public string Pattern { get; }
    /// <summary>React renderer module identifier.</summary>
    public string ModuleId { get; }
}

/// <summary>Request and strongly converted route and query values available to a page loader.</summary>
public sealed class DotReactPageContext(HttpContext httpContext)
{
    /// <summary>The underlying ASP.NET Core request context.</summary>
    public HttpContext HttpContext { get; } = httpContext;

    /// <summary>Gets a required route value converted to <typeparamref name="T"/>.</summary>
    public T GetRouteValue<T>(string name)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        if (!HttpContext.Request.RouteValues.TryGetValue(name, out var raw) || raw is null)
        {
            throw new InvalidOperationException($"Route value '{name}' was not provided.");
        }

        var text = Convert.ToString(raw, CultureInfo.InvariantCulture)!;
        return ConvertValue<T>(text, "Route value", name);
    }

    /// <summary>
    /// Gets a scalar query-string value converted to <typeparamref name="T"/> using the invariant culture.
    /// A missing value returns <see langword="null"/> when <typeparamref name="T"/> is nullable.
    /// </summary>
    /// <exception cref="InvalidOperationException">
    /// The value was not provided for a non-nullable type, or more than one value was provided.
    /// </exception>
    /// <exception cref="BadHttpRequestException">The supplied value cannot be converted to <typeparamref name="T"/>.</exception>
    public T GetQueryValue<T>(string name)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        var nullableTarget = Nullable.GetUnderlyingType(typeof(T));
        if (!HttpContext.Request.Query.TryGetValue(name, out var values))
        {
            if (nullableTarget is not null)
            {
                return default!;
            }

            throw new InvalidOperationException($"Query string value '{name}' was not provided.");
        }

        if (values.Count != 1)
        {
            throw new InvalidOperationException($"Query string value '{name}' must be provided exactly once.");
        }

        return ConvertValue<T>(values[0]!, "Query string value", name);
    }

    private static T ConvertValue<T>(string text, string source, string name)
    {
        var target = Nullable.GetUnderlyingType(typeof(T)) ?? typeof(T);
        try
        {
            object value = target.IsEnum
                ? Enum.Parse(target, text, ignoreCase: true)
                : target == typeof(Guid)
                    ? Guid.Parse(text)
                    : TypeDescriptor.GetConverter(target).ConvertFromInvariantString(text)
                      ?? throw new FormatException();
            return (T)value;
        }
        catch (Exception exception) when (exception is FormatException or ArgumentException or NotSupportedException)
        {
            throw new BadHttpRequestException($"{source} '{name}' is not a valid {target.Name}.", exception);
        }
    }
}
