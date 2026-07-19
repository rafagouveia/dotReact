using System.Security.Claims;
using System.Threading.RateLimiting;
using DotReact.AspNetCore;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;

namespace Microsoft.Extensions.DependencyInjection;

/// <summary>Registers opt-in resource protection for DotReact Server Actions.</summary>
public static class DotReactRateLimitingServiceCollectionExtensions
{
    /// <summary>Registers the fixed-window policy automatically applied to mapped DotReact actions.</summary>
    public static IServiceCollection AddDotReactRateLimiting(
        this IServiceCollection services,
        Action<DotReactRateLimitingOptions>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(services);
        var configured = services.AddOptions<DotReactRateLimitingOptions>();
        if (configure is not null) configured.Configure(configure);
        configured.Validate(static value => value.PermitLimit is > 0 and <= 1_000_000,
                "Rate-limit permit count must be between 1 and 1,000,000.")
            .Validate(static value => value.Window > TimeSpan.Zero && value.Window <= TimeSpan.FromDays(1),
                "Rate-limit window must be positive and no longer than one day.")
            .Validate(static value => value.QueueLimit is >= 0 and <= 10_000,
                "Rate-limit queue count must be between 0 and 10,000.")
            .ValidateOnStart();
        services.AddSingleton<DotReactRateLimitingRegistration>();
        services.AddRateLimiter(options =>
        {
            options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
            options.OnRejected = static async (context, cancellationToken) =>
            {
                if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
                    context.HttpContext.Response.Headers.RetryAfter = Math.Ceiling(retryAfter.TotalSeconds).ToString(
                        System.Globalization.CultureInfo.InvariantCulture);
                context.HttpContext.Response.ContentType = "application/problem+json";
                await context.HttpContext.Response.WriteAsync(
                    "{\"type\":\"https://httpstatuses.com/429\",\"title\":\"Too many DotReact action requests.\",\"status\":429}",
                    cancellationToken).ConfigureAwait(false);
            };
            options.AddPolicy(DotReactRateLimiting.PolicyName, context =>
            {
                var value = context.RequestServices.GetRequiredService<IOptions<DotReactRateLimitingOptions>>().Value;
                var partition = GetPartition(context, value);
                return RateLimitPartition.GetFixedWindowLimiter(partition, _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = value.PermitLimit,
                    Window = value.Window,
                    QueueLimit = value.QueueLimit,
                    QueueProcessingOrder = QueueProcessingOrder.OldestFirst,
                    AutoReplenishment = true
                });
            });
        });
        return services;
    }

    private static string GetPartition(HttpContext context, DotReactRateLimitingOptions options)
    {
        if (!options.PartitionAuthenticatedUsers || context.User.Identity?.IsAuthenticated != true)
            return "anonymous-or-global";
        return "user:" + (context.User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? context.User.Identity.Name
            ?? "authenticated");
    }
}
