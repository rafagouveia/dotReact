using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;
using Microsoft.AspNetCore.Authorization;
using System.Reflection;

namespace Microsoft.Extensions.DependencyInjection;

using DotReact.AspNetCore;

/// <summary>Dependency-injection registration for DotReact.</summary>
public static class DotReactServiceCollectionExtensions
{
    /// <summary>Adds the DotReact renderer and host services.</summary>
    public static IServiceCollection AddDotReact(
        this IServiceCollection services,
        Action<DotReactOptions>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(services);

        var options = services.AddOptions<DotReactOptions>();
        if (configure is not null)
        {
            options.Configure(configure);
        }

        options.Validate(
                value => value.RendererUrl.IsAbsoluteUri
                    && (value.RendererUrl.Scheme == Uri.UriSchemeHttp
                        || value.RendererUrl.Scheme == Uri.UriSchemeHttps),
                "RendererUrl must be an absolute HTTP or HTTPS URL.")
            .Validate(value => value.RequestTimeout > TimeSpan.Zero, "RequestTimeout must be positive.")
            .Validate(value => !value.RequireRendererToken || value.RendererToken is { Length: >= 32 },
                "RendererToken must contain at least 32 characters when RequireRendererToken is enabled.")
            .Validate(value => !string.IsNullOrWhiteSpace(value.ClientScriptSrc), "ClientScriptSrc is required.")
            .Validate(value => !string.IsNullOrWhiteSpace(value.RootElementId), "RootElementId is required.")
            .ValidateOnStart();

        services.AddTransient<DotReactRendererTelemetryHandler>();
        services.AddHttpClient<DotReactRendererClient>((provider, client) =>
            {
                var value = provider.GetRequiredService<IOptions<DotReactOptions>>().Value;
                client.BaseAddress = EnsureTrailingSlash(value.RendererUrl);
                client.Timeout = Timeout.InfiniteTimeSpan;
            })
            .AddHttpMessageHandler<DotReactRendererTelemetryHandler>();
        services.TryAddScoped<IDotReactRenderer>(provider => provider.GetRequiredService<DotReactRendererClient>());
        services.AddHealthChecks().AddCheck<DotReactRendererHealthCheck>(
            "dotreact_renderer", tags: ["ready"]);
        services.AddAntiforgery(options => options.HeaderName = "X-DotReact-CSRF");
        services.AddOptions<DotReactActionOptions>()
            .Validate(value => value.MaxRequestBodyBytes > 0, "MaxRequestBodyBytes must be positive.")
            .Validate(value => value.MaxReplayBodyBytes > 0, "MaxReplayBodyBytes must be positive.")
            .Validate(value => value.MaxIdempotencyEntries > 0, "MaxIdempotencyEntries must be positive.")
            .Validate(value => value.MaxIdempotencyKeyLength is >= 16 and <= 512,
                "MaxIdempotencyKeyLength must be between 16 and 512.")
            .Validate(value => value.IdempotencyRetention > TimeSpan.Zero
                && value.IdempotencyRetention <= TimeSpan.FromDays(1),
                "IdempotencyRetention must be positive and no longer than one day.")
            .ValidateOnStart();
        services.TryAddSingleton(TimeProvider.System);
        services.TryAddSingleton<IDotReactActionIdempotencyStore, InMemoryDotReactActionIdempotencyStore>();
        return services;
    }

    /// <summary>Discovers and registers only page classes carrying <see cref="DotReactPageAttribute"/>.</summary>
    public static IServiceCollection AddDotReactPages(this IServiceCollection services, Assembly assembly)
    {
        ArgumentNullException.ThrowIfNull(assembly);
        return services.AddDotReactPages([assembly]);
    }

    /// <summary>Discovers pages across multiple application or feature assemblies.</summary>
    public static IServiceCollection AddDotReactPages(
        this IServiceCollection services,
        IEnumerable<Assembly> assemblies)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(assemblies);
        var candidates = assemblies.Distinct().ToArray();
        if (candidates.Length == 0)
            throw new ArgumentException("At least one assembly is required.", nameof(assemblies));
        if (candidates.Any(assembly => assembly is null))
            throw new ArgumentException("Assembly collections cannot contain null values.", nameof(assemblies));
        var registry = GetOrAddPageRegistry(services);
        foreach (var assembly in candidates)
        foreach (var (type, contract, attribute) in DotReactDiscovery.Find<DotReactPageAttribute>(
                     assembly, typeof(IDotReactPage<>), typeof(IDotReactResultPage<>)))
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(attribute.Pattern);
            ArgumentException.ThrowIfNullOrWhiteSpace(attribute.ModuleId);
            if (registry.Items.Any(item => string.Equals(item.Pattern, attribute.Pattern, StringComparison.OrdinalIgnoreCase)))
                throw new InvalidOperationException($"A DotReact page is already registered for pattern '{attribute.Pattern}'.");
            if (registry.Items.Any(item => string.Equals(item.ModuleId, attribute.ModuleId, StringComparison.Ordinal)))
                throw new InvalidOperationException($"A DotReact page is already registered for module ID '{attribute.ModuleId}'.");
            if (type.GetCustomAttribute<DotReactCacheAttribute>(inherit: true) is not null
                && type.GetCustomAttributes(inherit: true).OfType<IAuthorizeData>().Any())
                throw new InvalidOperationException(
                    $"Shared DotReact caching cannot be enabled on authorized page '{type.FullName}'.");
            var returnsResult = contract.GetGenericTypeDefinition() == typeof(IDotReactResultPage<>);
            registry.Items.Add(new(type, contract.GenericTypeArguments[0], attribute.Pattern, attribute.ModuleId, returnsResult));
            services.TryAddTransient(type);
        }
        return services;
    }

    /// <summary>Discovers and registers only action classes carrying <see cref="DotReactActionAttribute"/>.</summary>
    public static IServiceCollection AddDotReactActions(this IServiceCollection services, Assembly assembly)
    {
        ArgumentNullException.ThrowIfNull(assembly);
        return services.AddDotReactActions([assembly]);
    }

    /// <summary>Discovers actions across multiple application or feature assemblies.</summary>
    public static IServiceCollection AddDotReactActions(
        this IServiceCollection services,
        IEnumerable<Assembly> assemblies)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(assemblies);
        var candidates = assemblies.Distinct().ToArray();
        if (candidates.Length == 0)
            throw new ArgumentException("At least one assembly is required.", nameof(assemblies));
        if (candidates.Any(assembly => assembly is null))
            throw new ArgumentException("Assembly collections cannot contain null values.", nameof(assemblies));
        var registry = GetOrAddActionRegistry(services);
        foreach (var assembly in candidates)
        foreach (var (type, contract, attribute) in DotReactDiscovery.Find<DotReactActionAttribute>(assembly, typeof(IDotReactAction<,>)))
        {
            ArgumentException.ThrowIfNullOrWhiteSpace(attribute.Id);
            if (!IsCanonicalActionId(attribute.Id))
                throw new InvalidOperationException($"DotReact action ID '{attribute.Id}' is not canonical.");
            if (registry.Items.Any(item => string.Equals(item.Id, attribute.Id, StringComparison.OrdinalIgnoreCase)))
                throw new InvalidOperationException($"A DotReact action is already registered with ID '{attribute.Id}'.");
            var resourcePolicy = type.GetCustomAttribute<DotReactAuthorizeResourceAttribute>(inherit: true);
            if (resourcePolicy is not null)
            {
                if (type.GetCustomAttributes(inherit: true).OfType<IAllowAnonymous>().Any())
                    throw new InvalidOperationException(
                        $"Resource-authorized DotReact action '{type.FullName}' cannot allow anonymous access.");
                var provider = typeof(IDotReactActionResourceProvider<>).MakeGenericType(contract.GenericTypeArguments[0]);
                if (!provider.IsAssignableFrom(type))
                    throw new InvalidOperationException(
                        $"Resource-authorized DotReact action '{type.FullName}' must implement '{provider}'.");
            }
            registry.Items.Add(new(type, contract.GenericTypeArguments[0], contract.GenericTypeArguments[1], attribute.Id));
            services.TryAddTransient(type);
        }
        return services;
    }

    private static DotReactPageRegistry GetOrAddPageRegistry(IServiceCollection services) =>
        GetOrAddRegistry(services, static () => new DotReactPageRegistry());

    private static DotReactActionRegistry GetOrAddActionRegistry(IServiceCollection services) =>
        GetOrAddRegistry(services, static () => new DotReactActionRegistry());

    private static T GetOrAddRegistry<T>(IServiceCollection services, Func<T> factory) where T : class
    {
        var existing = services.LastOrDefault(item => item.ServiceType == typeof(T))?.ImplementationInstance as T;
        if (existing is not null) return existing;
        var created = factory();
        services.AddSingleton(created);
        return created;
    }

    private static bool IsCanonicalActionId(string id)
    {
        var segments = id.Split('/');
        return segments.Length > 0 && segments.All(segment =>
            segment.Length > 0
            && segment is not "." and not ".."
            && IsAsciiLetterOrDigit(segment[0])
            && segment.All(character => IsAsciiLetterOrDigit(character) || character is '.' or '_' or '-'));
    }

    private static bool IsAsciiLetterOrDigit(char value) =>
        value is >= 'A' and <= 'Z' or >= 'a' and <= 'z' or >= '0' and <= '9';

    private static Uri EnsureTrailingSlash(Uri uri) =>
        uri.AbsoluteUri.EndsWith("/", StringComparison.Ordinal)
            ? uri
            : new Uri(uri.AbsoluteUri + '/', UriKind.Absolute);
}
