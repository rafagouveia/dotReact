using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace DotReact.AspNetCore;

internal sealed class DotReactRendererHealthCheck(DotReactRendererClient renderer) : IHealthCheck
{
    public Task<HealthCheckResult> CheckHealthAsync(
        HealthCheckContext context,
        CancellationToken cancellationToken = default) =>
        renderer.CheckHealthAsync(cancellationToken);
}
