using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace DotReact.AspNetCore;

/// <summary>Opts an anonymous page loader into distributed props caching.</summary>
[AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = true)]
public sealed class DotReactCacheAttribute : Attribute
{
    /// <summary>Creates a cache policy with an absolute lifetime in seconds.</summary>
    public DotReactCacheAttribute(int durationSeconds)
    {
        if (durationSeconds is < 1 or > 86_400)
            throw new ArgumentOutOfRangeException(nameof(durationSeconds),
                "Cache duration must be between 1 second and 24 hours.");
        DurationSeconds = durationSeconds;
    }

    /// <summary>Absolute distributed-cache lifetime in seconds.</summary>
    public int DurationSeconds { get; }
}

/// <summary>Controls DotReact distributed page-cache keys and payload limits.</summary>
public sealed class DotReactDistributedCacheOptions
{
    /// <summary>Application-specific key prefix. Change it when deploying an incompatible cache schema.</summary>
    public string KeyPrefix { get; set; } = "dotreact:pages:v1:";
    /// <summary>Largest serialized loader result stored in the distributed cache.</summary>
    public int MaxEntryBytes { get; set; } = 1024 * 1024;
}

/// <summary>Invalidates distributed page-loader results by exact local path.</summary>
public interface IDotReactCacheInvalidator
{
    /// <summary>Invalidates each exact path, including its query string when present.</summary>
    ValueTask InvalidateAsync(
        IEnumerable<string> paths,
        CancellationToken cancellationToken = default);
}

internal interface IDotReactPageCache
{
    ValueTask<DotReactPageResult<TProps>> GetOrCreateAsync<TProps>(
        string path,
        TimeSpan lifetime,
        Func<CancellationToken, ValueTask<DotReactPageResult<TProps>>> factory,
        CancellationToken cancellationToken);
}

internal sealed class DistributedDotReactPageCache(
    IDistributedCache cache,
    IOptions<DotReactDistributedCacheOptions> options) : IDotReactPageCache, IDotReactCacheInvalidator
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _locks = new(StringComparer.Ordinal);
    private readonly DotReactDistributedCacheOptions _options = options.Value;

    public async ValueTask<DotReactPageResult<TProps>> GetOrCreateAsync<TProps>(
        string path,
        TimeSpan lifetime,
        Func<CancellationToken, ValueTask<DotReactPageResult<TProps>>> factory,
        CancellationToken cancellationToken)
    {
        ValidatePath(path);
        ArgumentNullException.ThrowIfNull(factory);
        var key = CreateKey(path);
        var cached = await ReadAsync<TProps>(key, cancellationToken).ConfigureAwait(false);
        if (cached is not null)
            return DotReactPageResult<TProps>.Page(cached.Props, cached.StatusCode);

        var gate = _locks.GetOrAdd(key, static _ => new SemaphoreSlim(1, 1));
        await gate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            cached = await ReadAsync<TProps>(key, cancellationToken).ConfigureAwait(false);
            if (cached is not null)
                return DotReactPageResult<TProps>.Page(cached.Props, cached.StatusCode);

            var result = await factory(cancellationToken).ConfigureAwait(false);
            if (result.Kind != DotReactPageResultKind.Page)
                return result;

            var payload = JsonSerializer.SerializeToUtf8Bytes(
                new CachedPage<TProps>(result.Props!, result.StatusCode), JsonOptions);
            if (payload.Length <= _options.MaxEntryBytes)
            {
                await cache.SetAsync(key, payload, new DistributedCacheEntryOptions
                {
                    AbsoluteExpirationRelativeToNow = lifetime
                }, cancellationToken).ConfigureAwait(false);
            }
            return result;
        }
        finally
        {
            gate.Release();
            if (gate.CurrentCount == 1)
                _locks.TryRemove(new KeyValuePair<string, SemaphoreSlim>(key, gate));
        }
    }

    public async ValueTask InvalidateAsync(
        IEnumerable<string> paths,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(paths);
        foreach (var path in paths.Distinct(StringComparer.Ordinal))
        {
            ValidatePath(path);
            await cache.RemoveAsync(CreateKey(path), cancellationToken).ConfigureAwait(false);
        }
    }

    private async ValueTask<CachedPage<TProps>?> ReadAsync<TProps>(
        string key,
        CancellationToken cancellationToken)
    {
        var payload = await cache.GetAsync(key, cancellationToken).ConfigureAwait(false);
        if (payload is null) return null;
        if (payload.Length > _options.MaxEntryBytes)
        {
            await cache.RemoveAsync(key, cancellationToken).ConfigureAwait(false);
            return null;
        }
        try
        {
            return JsonSerializer.Deserialize<CachedPage<TProps>>(payload, JsonOptions);
        }
        catch (JsonException)
        {
            await cache.RemoveAsync(key, cancellationToken).ConfigureAwait(false);
            return null;
        }
    }

    private string CreateKey(string path)
    {
        var digest = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(path)));
        return _options.KeyPrefix + digest;
    }

    private static void ValidatePath(string path)
    {
        if (path.Length is 0 or > 2_048 || path[0] != '/'
            || path.StartsWith("//", StringComparison.Ordinal) || path.Contains('\\')
            || path.Any(char.IsControl))
            throw new ArgumentException("Cache paths must be bounded local application paths.", nameof(path));
    }

    private sealed record CachedPage<TProps>(TProps Props, int StatusCode);
}

/// <summary>Registration for DotReact distributed loader caching.</summary>
public static class DotReactDistributedCachingExtensions
{
    /// <summary>
    /// Enables distributed page-loader caching using the application's registered
    /// <see cref="IDistributedCache"/> implementation (for example Redis or SQL Server).
    /// </summary>
    public static IServiceCollection AddDotReactDistributedCaching(
        this IServiceCollection services,
        Action<DotReactDistributedCacheOptions>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(services);
        if (!services.Any(descriptor => descriptor.ServiceType == typeof(IDistributedCache)))
            throw new InvalidOperationException(
                "Register an IDistributedCache implementation before AddDotReactDistributedCaching.");
        var builder = services.AddOptions<DotReactDistributedCacheOptions>()
            .Validate(options => !string.IsNullOrWhiteSpace(options.KeyPrefix)
                && options.KeyPrefix.Length <= 128, "KeyPrefix must contain 1-128 characters.")
            .Validate(options => options.MaxEntryBytes is >= 1024 and <= 16 * 1024 * 1024,
                "MaxEntryBytes must be between 1 KiB and 16 MiB.")
            .ValidateOnStart();
        if (configure is not null) builder.Configure(configure);
        services.TryAddSingleton<DistributedDotReactPageCache>();
        services.TryAddSingleton<IDotReactPageCache>(provider =>
            provider.GetRequiredService<DistributedDotReactPageCache>());
        services.TryAddSingleton<IDotReactCacheInvalidator>(provider =>
            provider.GetRequiredService<DistributedDotReactPageCache>());
        return services;
    }
}
