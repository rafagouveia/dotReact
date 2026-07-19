using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Routing;

namespace Microsoft.AspNetCore.Routing;

/// <summary>Azure-compatible liveness and readiness endpoints.</summary>
public static class DotReactHealthEndpointExtensions
{
    /// <summary>Maps host liveness and renderer readiness without exposing internal details.</summary>
    public static IEndpointRouteBuilder MapDotReactHealthChecks(this IEndpointRouteBuilder endpoints)
    {
        ArgumentNullException.ThrowIfNull(endpoints);
        endpoints.MapHealthChecks("/_health/live", new HealthCheckOptions
        {
            Predicate = static _ => false,
            AllowCachingResponses = false
        });
        endpoints.MapHealthChecks("/_health/ready", new HealthCheckOptions
        {
            Predicate = static registration => registration.Tags.Contains("ready"),
            AllowCachingResponses = false
        });
        return endpoints;
    }
}
