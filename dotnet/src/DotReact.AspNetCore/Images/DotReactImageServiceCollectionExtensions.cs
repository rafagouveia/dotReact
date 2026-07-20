using System.Net;
using DotReact.AspNetCore.Images;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace Microsoft.Extensions.DependencyInjection;

/// <summary>Registers the isolated DotReact image optimization pipeline.</summary>
public static class DotReactImageServiceCollectionExtensions
{
    /// <summary>Registers source validation, managed image processing, and remote transport.</summary>
    public static IServiceCollection AddDotReactImages(
        this IServiceCollection services,
        Action<DotReactImageOptions>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(services);
        var options = services.AddOptions<DotReactImageOptions>();
        if (configure is not null) options.Configure(configure);
        options.ValidateOnStart();
        services.TryAddEnumerable(ServiceDescriptor.Singleton<IValidateOptions<DotReactImageOptions>, DotReactImageOptionsValidator>());
        services.TryAddSingleton<IDotReactImageSourceReader, DotReactImageSourceReader>();
        services.TryAddSingleton<DotReactImageConcurrencyGate>();
        services.AddHttpClient(DotReactImageHttpClient.Name)
            .ConfigurePrimaryHttpMessageHandler(static () => new SocketsHttpHandler
            {
                AllowAutoRedirect = false,
                AutomaticDecompression = DecompressionMethods.None,
                ConnectCallback = DotReactImageSafeConnect.ConnectAsync,
                ConnectTimeout = TimeSpan.FromSeconds(5),
                PooledConnectionLifetime = TimeSpan.FromMinutes(5),
                UseCookies = false
            });
        return services;
    }

    /// <summary>Registers the image pipeline with an application-selected processor.</summary>
    public static IServiceCollection AddDotReactImages<TProcessor>(
        this IServiceCollection services,
        Action<DotReactImageOptions>? configure = null)
        where TProcessor : class, IDotReactImageProcessor
    {
        services.AddDotReactImages(configure);
        services.TryAddSingleton<IDotReactImageProcessor, TProcessor>();
        return services;
    }
}

internal sealed class DotReactImageConcurrencyGate(IOptions<DotReactImageOptions> options) : IDisposable
{
    private readonly SemaphoreSlim semaphore = new(options.Value.MaxConcurrentTransforms);

    internal async ValueTask<IDisposable?> TryAcquireAsync(CancellationToken cancellationToken)
    {
        if (!await semaphore.WaitAsync(TimeSpan.Zero, cancellationToken).ConfigureAwait(false)) return null;
        return new Lease(semaphore);
    }

    public void Dispose() => semaphore.Dispose();

    private sealed class Lease(SemaphoreSlim semaphore) : IDisposable
    {
        private SemaphoreSlim? owner = semaphore;
        public void Dispose() => Interlocked.Exchange(ref owner, null)?.Release();
    }
}
