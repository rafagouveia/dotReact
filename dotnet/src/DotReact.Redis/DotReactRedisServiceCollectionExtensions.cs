using DotReact.AspNetCore;
using DotReact.AspNetCore.Authentication;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using StackExchange.Redis;

namespace DotReact.Redis;

/// <summary>Registers shared Redis implementations for multi-replica DotReact deployments.</summary>
public static class DotReactRedisServiceCollectionExtensions
{
    /// <summary>Uses an application-owned Redis connection.</summary>
    public static IServiceCollection AddDotReactRedis(
        this IServiceCollection services,
        IConnectionMultiplexer connection,
        Action<DotReactRedisOptions>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(connection);
        services.TryAddSingleton(connection);
        return RegisterStores(services, configure);
    }

    /// <summary>Creates one shared multiplexer lazily from validated StackExchange.Redis configuration.</summary>
    public static IServiceCollection AddDotReactRedis(
        this IServiceCollection services,
        ConfigurationOptions configuration,
        Action<DotReactRedisOptions>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configuration);
        var snapshot = configuration.Clone();
        services.TryAddSingleton<IConnectionMultiplexer>(_ => ConnectionMultiplexer.Connect(snapshot));
        return RegisterStores(services, configure);
    }

    private static IServiceCollection RegisterStores(
        IServiceCollection services,
        Action<DotReactRedisOptions>? configure)
    {
        var options = services.AddOptions<DotReactRedisOptions>();
        if (configure is not null) options.Configure(configure);
        options.Validate(value => IsValidPrefix(value.KeyPrefix),
                "Redis KeyPrefix must contain 1-64 ASCII letters, digits, '.', '_' or '-'.")
            .Validate(value => value.IdempotencyPollInterval >= TimeSpan.FromMilliseconds(5)
                && value.IdempotencyPollInterval <= TimeSpan.FromSeconds(5),
                "IdempotencyPollInterval must be between 5ms and 5s.")
            .Validate(value => value.IdempotencyLockLease >= TimeSpan.FromSeconds(1)
                && value.IdempotencyLockLease <= TimeSpan.FromMinutes(5),
                "IdempotencyLockLease must be between 1 second and 5 minutes.")
            .Validate(value => value.ArtifactRetentionAfterStale >= TimeSpan.Zero
                && value.ArtifactRetentionAfterStale <= TimeSpan.FromDays(30),
                "ArtifactRetentionAfterStale must be between zero and 30 days.")
            .Validate(value => value.StaticArtifactRetention >= TimeSpan.FromDays(1)
                && value.StaticArtifactRetention <= TimeSpan.FromDays(365),
                "StaticArtifactRetention must be between one and 365 days.")
            .Validate(value => value.SessionRevocationRetention >= TimeSpan.FromDays(1)
                    && value.SessionRevocationRetention <= TimeSpan.FromDays(366),
                "SessionRevocationRetention must be between 1 and 366 days.")
            .ValidateOnStart();

        services.TryAddSingleton(TimeProvider.System);

        services.Replace(ServiceDescriptor.Singleton<IDotReactPrerenderStore, RedisDotReactPrerenderStore>());
        services.Replace(ServiceDescriptor.Singleton<IDotReactActionIdempotencyStore, RedisDotReactActionIdempotencyStore>());
        services.Replace(ServiceDescriptor.Singleton<IDotReactSessionStore, RedisDotReactSessionStore>());
        services.Replace(ServiceDescriptor.Singleton(
            typeof(DotReactPrerenderCoordinator), typeof(DotReactPrerenderCoordinator)));
        return services;
    }

    private static bool IsValidPrefix(string value) => value.Length is > 0 and <= 64
        && value.All(character => char.IsAsciiLetterOrDigit(character) || character is '.' or '_' or '-');
}
