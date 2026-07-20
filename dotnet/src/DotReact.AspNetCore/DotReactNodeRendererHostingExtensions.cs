using System.Security.Cryptography;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace Microsoft.Extensions.DependencyInjection;

using DotReact.AspNetCore;

/// <summary>Registers the optional production Node renderer supervisor.</summary>
public static class DotReactNodeRendererHostingExtensions
{
    /// <summary>Adds a loopback-only Node renderer managed by the ASP.NET Core host.</summary>
    public static IServiceCollection AddDotReactNodeRenderer(
        this IServiceCollection services,
        Action<DotReactNodeRendererOptions> configure)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configure);
        services.AddOptions<DotReactNodeRendererOptions>()
            .Configure(configure)
            .Validate(value => value.Port is > 0 and <= 65_535, "Node renderer port is invalid.")
            .Validate(value => !string.IsNullOrWhiteSpace(value.ExecutablePath), "Node executable path is required.")
            .Validate(value => !string.IsNullOrWhiteSpace(value.ScriptPath), "Node renderer script path is required.")
            .Validate(value => !string.IsNullOrWhiteSpace(value.ServerEntryPath), "SSR server entry path is required.")
            .Validate(value => value.StartupTimeout > TimeSpan.Zero && value.ShutdownTimeout > TimeSpan.Zero,
                "Node renderer lifecycle timeouts must be positive.")
            .Validate(value => value.NodeMemoryMb is >= 64 and <= 16_384, "Node memory limit is invalid.")
            .Validate(value => value.MaxRestarts is >= 0 and <= 100, "Node renderer restart limit is invalid.")
            .Validate(value => value.RestartWindow > TimeSpan.Zero, "Node renderer restart window must be positive.")
            .Validate(value => value.RestartBackoff >= TimeSpan.Zero && value.RestartBackoff <= TimeSpan.FromMinutes(1),
                "Node renderer restart backoff must be between zero and one minute.")
            .Validate(static value => value.PublicEnvironmentVariables.All(static pair =>
                    DotReactNodeRendererEnvironment.IsSafePublicVariable(pair.Key, pair.Value)),
                "Node renderer public environment variables contain a reserved name or invalid value.")
            .ValidateOnStart();
        services.TryAddSingleton(static _ => new DotReactManagedRendererCredentials(
            Convert.ToBase64String(RandomNumberGenerator.GetBytes(48))));
        services.AddOptions<DotReactOptions>()
            .PostConfigure<IOptions<DotReactNodeRendererOptions>, DotReactManagedRendererCredentials>((options, configuredNode, credentials) =>
            {
                var node = configuredNode.Value;
                options.RendererUrl = new Uri($"http://127.0.0.1:{node.Port}");
                options.RendererToken = credentials.Token;
                options.RequireRendererToken = true;
            });
        services.AddHostedService<DotReactNodeRendererHostedService>();
        return services;
    }
}
