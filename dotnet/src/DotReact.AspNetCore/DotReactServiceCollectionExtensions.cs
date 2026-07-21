using System.Reflection;
using System.Net.Sockets;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

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
            .Validate(value => value.RendererRetryCount is >= 0 and <= 8,
                "RendererRetryCount must be between 0 and 8.")
            .Validate(value => value.RendererRetryDelay >= TimeSpan.Zero
                && value.RendererRetryDelay <= TimeSpan.FromSeconds(2),
                "RendererRetryDelay must be between zero and two seconds.")
            .Validate(value => value.RendererConnectTimeout >= TimeSpan.FromMilliseconds(10)
                && value.RendererConnectTimeout <= TimeSpan.FromSeconds(5),
                "RendererConnectTimeout must be between 10 milliseconds and five seconds.")
            .Validate(value => value.RendererSocketPath is null
                    || DotReactRendererInterprocessEndpoint.IsValid(value.RendererSocketPath),
                "RendererSocketPath must be a valid Windows named pipe or absolute Unix socket path.")
            .Validate(value => value.RendererFrameSocketPath is null
                    || DotReactRendererInterprocessEndpoint.IsValid(value.RendererFrameSocketPath),
                "RendererFrameSocketPath must be a valid Windows named pipe or absolute Unix socket path.")
            .Validate(value => !value.UseFramedRendererTransport || value.RendererFrameSocketPath is not null,
                "RendererFrameSocketPath is required when framed renderer transport is enabled.")
            .Validate(value => !value.UseFramedRendererTransport || value.UseBinaryRendererTransport,
                "Framed renderer transport requires the binary renderer protocol.")
            .Validate(value => value.RendererFrameConnectionCount is >= 1 and <= 32,
                "RendererFrameConnectionCount must be between 1 and 32.")
            .Validate(value => value.RendererFrameMaxInFlightPerConnection is >= 1 and <= 1_024,
                "RendererFrameMaxInFlightPerConnection must be between 1 and 1024.")
            .Validate(value => value.RendererMaxQueuedRequests is >= -1 and <= 10_000,
                "RendererMaxQueuedRequests must be -1 (automatic) or between 0 and 10000.")
            .Validate(value => value.RendererOverloadRetryAfter > TimeSpan.Zero
                    && value.RendererOverloadRetryAfter <= TimeSpan.FromMinutes(1),
                "RendererOverloadRetryAfter must be positive and no longer than one minute.")
            .Validate(value => !value.RequireRendererToken || value.RendererToken is { Length: >= 32 },
                "RendererToken must contain at least 32 characters when RequireRendererToken is enabled.")
            .Validate(value => !string.IsNullOrWhiteSpace(value.ClientScriptSrc), "ClientScriptSrc is required.")
            .Validate(value => value.ClientStyleSrc is null || !string.IsNullOrWhiteSpace(value.ClientStyleSrc),
                "ClientStyleSrc must be null or non-empty.")
            .Validate(value => value.ClientRouteAssets is not null
                    && value.ClientRouteAssets.Count <= 1_000_000
                    && value.ClientRouteAssets.All(route =>
                        !string.IsNullOrWhiteSpace(route.Key)
                        && route.Key.Length <= 1_024
                        && route.Value is not null
                        && route.Value.Styles is { Count: <= 64 }
                        && route.Value.ModulePreloads is { Count: <= 64 }
                        && route.Value.Styles.Concat(route.Value.ModulePreloads)
                            .All(IsSafeClientAssetPath)),
                "ClientRouteAssets must contain non-empty module IDs and root-relative asset URLs.")
            .Validate(value => !string.IsNullOrWhiteSpace(value.RootElementId), "RootElementId is required.")
            .Validate(value => value.PrerenderBuildId.Length is > 0 and <= 128
                && value.PrerenderBuildId.All(character => char.IsAsciiLetterOrDigit(character)
                    || character is '.' or '_' or '-'),
                "PrerenderBuildId must contain only ASCII letters, digits, '.', '_' or '-'.")
            .Validate(value => value.MaxStaticPaths is > 0 and <= 1_000_000,
                "MaxStaticPaths must be between 1 and 1000000.")
            .Validate(value => value.MaxSerializedPropsBytes is >= 1024 and <= 64 * 1024 * 1024,
                "MaxSerializedPropsBytes must be between 1024 bytes and 64 MiB.")
            .Validate(value => value.MaxCoalescedRenders is >= 1 and <= 65_536,
                "MaxCoalescedRenders must be between 1 and 65536.")
            .Validate(value => value.ClientNavigationCacheDuration >= TimeSpan.Zero
                && value.ClientNavigationCacheDuration <= TimeSpan.FromHours(1),
                "ClientNavigationCacheDuration must be between zero and one hour.")
            .Validate(value => !value.EnableBrowserVitals || IsSafeEndpointPath(value.BrowserVitalsEndpointPath),
                "BrowserVitalsEndpointPath must be a safe root-relative path.")
            .ValidateOnStart();

        services.AddTransient<DotReactRendererTelemetryHandler>();
        services.TryAddSingleton<DotReactFramedRendererConnectionPool>();
        services.AddHttpClient<DotReactRendererClient>((provider, client) =>
            {
                var value = provider.GetRequiredService<IOptions<DotReactOptions>>().Value;
                client.BaseAddress = EnsureTrailingSlash(value.RendererUrl);
                client.Timeout = Timeout.InfiniteTimeSpan;
            })
            .ConfigurePrimaryHttpMessageHandler(provider => DotReactRendererConnection.CreateHandler(
                provider.GetRequiredService<IOptions<DotReactOptions>>().Value))
            .AddHttpMessageHandler<DotReactRendererTelemetryHandler>();
        services.AddHttpClient<DotReactStreamingRendererClient>((provider, client) =>
            {
                var value = provider.GetRequiredService<IOptions<DotReactOptions>>().Value;
                client.BaseAddress = EnsureTrailingSlash(value.RendererUrl);
                client.Timeout = Timeout.InfiniteTimeSpan;
            })
            .ConfigurePrimaryHttpMessageHandler(provider => DotReactRendererConnection.CreateHandler(
                provider.GetRequiredService<IOptions<DotReactOptions>>().Value))
            .AddHttpMessageHandler<DotReactRendererTelemetryHandler>();
        services.TryAddSingleton<DotReactRenderCoordinator>();
        services.TryAddSingleton<DotReactRenderAdmissionController>();
        services.TryAddScoped<IDotReactRenderer, DotReactCoalescingRenderer>();
        services.TryAddScoped<IDotReactStreamingRenderer, DotReactAdmissionStreamingRenderer>();
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
        services.AddOptions<DotReactMemoryPrerenderStoreOptions>()
            .Validate(value => value.MaxEntries > 0, "Prerender MaxEntries must be positive.")
            .Validate(value => value.MaxBytes > 0, "Prerender MaxBytes must be positive.")
            .ValidateOnStart();
        services.TryAddSingleton<IDotReactPrerenderStore>(provider =>
            new DotReactMemoryPrerenderStore(
                provider.GetRequiredService<IOptions<DotReactMemoryPrerenderStoreOptions>>().Value));
        services.TryAddSingleton<DotReactPrerenderCoordinator>();
        return services;
    }

    private static bool IsSafeClientAssetPath(string path) =>
        path.Length is > 1 and <= 2_048
        && path[0] == '/'
        && !path.StartsWith("//", StringComparison.Ordinal)
        && !path.Contains('\\')
        && !path.Any(char.IsControl)
        && !path.Split('?', '#')[0].Split('/').Any(segment => segment is "." or "..");

    private static bool IsSafeEndpointPath(string path) =>
        IsSafeClientAssetPath(path)
        && !path.Contains('?')
        && !path.Contains('#');

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
        {
            foreach (var registration in assembly.GetCustomAttributes<DotReactPageRegistrationAttribute>())
            {
                var contract = FindPageContract(registration.PageType);
                RegisterPage(
                    services, candidates, registry, registration.PageType, contract,
                    registration.Pattern, registration.ModuleId);
            }

            foreach (var (type, contract, attribute) in DotReactDiscovery.Find<DotReactPageAttribute>(
                         assembly, typeof(IDotReactPage<>), typeof(IDotReactResultPage<>)))
            {
                RegisterPage(
                    services, candidates, registry, type, contract, attribute.Pattern, attribute.ModuleId);
            }
        }
        return services;
    }

    private static Type FindPageContract(Type type)
    {
        var contracts = type.GetInterfaces().Where(candidate => candidate.IsGenericType
            && candidate.GetGenericTypeDefinition() is var definition
            && (definition == typeof(IDotReactPage<>) || definition == typeof(IDotReactResultPage<>)))
            .ToArray();
        return contracts.Length == 1
            ? contracts[0]
            : throw new InvalidOperationException(
                $"Registered type '{type.FullName}' must implement exactly one supported DotReact page contract.");
    }

    private static void RegisterPage(
        IServiceCollection services,
        IReadOnlyList<Assembly> assemblies,
        DotReactPageRegistry registry,
        Type type,
        Type contract,
        string pattern,
        string moduleId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(pattern);
        ArgumentException.ThrowIfNullOrWhiteSpace(moduleId);
        if (registry.Items.Any(item => string.Equals(item.Pattern, pattern, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"A DotReact page is already registered for pattern '{pattern}'.");
        if (registry.Items.Any(item => string.Equals(item.ModuleId, moduleId, StringComparison.Ordinal)))
            throw new InvalidOperationException($"A DotReact page is already registered for module ID '{moduleId}'.");
        ValidateSharedCachePolicy(type);
        var returnsResult = contract.GetGenericTypeDefinition() == typeof(IDotReactResultPage<>);
        var prerender = type.GetCustomAttribute<DotReactPrerenderAttribute>(inherit: false) is null
            ? null : DotReactPrerenderMetadata.Create(type);
        var streaming = type.GetCustomAttribute<DotReactStreamingAttribute>(inherit: false) is not null;
        if (streaming && prerender is not null)
            throw new InvalidOperationException(
                $"Page '{type.FullName}' cannot combine streaming SSR with static prerendering.");
        registry.Items.Add(new(
            type, contract.GenericTypeArguments[0], pattern, moduleId, returnsResult, streaming, prerender));
        services.TryAddTransient(type);
        if (prerender is not null)
            RegisterStaticPathProvider(services, assemblies, prerender);
    }

    internal static void ValidateSharedCachePolicy(Type type)
    {
        if (type.GetCustomAttribute<DotReactCacheAttribute>(inherit: true) is null) return;
        var attributes = type.GetCustomAttributes(inherit: true);
        if (attributes.OfType<IAuthorizeData>().Any() || !attributes.OfType<IAllowAnonymous>().Any())
            throw new InvalidOperationException(
                $"Shared DotReact caching requires an explicitly anonymous page and cannot be enabled on '{type.FullName}'.");
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

    private static void RegisterStaticPathProvider(
        IServiceCollection services,
        IReadOnlyList<Assembly> assemblies,
        DotReactPrerenderMetadata metadata)
    {
        var implementations = assemblies.SelectMany(static assembly => assembly.DefinedTypes)
            .Where(type => type is { IsClass: true, IsAbstract: false }
                && metadata.StaticPathProviderType.IsAssignableFrom(type.AsType()))
            .Select(static type => type.AsType())
            .Distinct()
            .ToArray();
        if (implementations.Length > 1)
            throw new InvalidOperationException(
                $"More than one static path provider was discovered for '{metadata.PageType.FullName}'.");
        if (implementations.Length == 1)
        {
            services.TryAddTransient(metadata.StaticPathProviderType, implementations[0]);
            services.TryAddEnumerable(ServiceDescriptor.Transient(
                typeof(IDotReactStaticPathSource),
                typeof(DotReactStaticPathSource<>).MakeGenericType(metadata.PageType)));
        }
    }

    private static Uri EnsureTrailingSlash(Uri uri) =>
        uri.AbsoluteUri.EndsWith("/", StringComparison.Ordinal)
            ? uri
            : new Uri(uri.AbsoluteUri + '/', UriKind.Absolute);

}

internal static class DotReactRendererConnection
{
    internal static SocketsHttpHandler CreateHandler(DotReactOptions options)
    {
        var handler = new SocketsHttpHandler
        {
            ConnectTimeout = options.RendererConnectTimeout,
            PooledConnectionLifetime = TimeSpan.FromMinutes(5)
        };
        if (options.RendererSocketPath is { Length: > 0 } socketPath)
        {
            handler.ConnectCallback = (_, cancellationToken) =>
                DotReactRendererInterprocessEndpoint.ConnectAsync(socketPath, cancellationToken);
        }
        return handler;
    }
}
