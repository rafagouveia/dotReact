using System.Diagnostics;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace DotReact.AspNetCore;

/// <summary>Maps the bounded, same-origin browser performance telemetry endpoint.</summary>
public static class DotReactWebVitalsEndpointExtensions
{
    private const int MaxBodyBytes = 4 * 1024;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        MaxDepth = 8
    };

    /// <summary>Maps the Web Vitals receiver configured by <see cref="DotReactOptions"/>.</summary>
    public static IEndpointConventionBuilder MapDotReactWebVitals(this IEndpointRouteBuilder endpoints)
    {
        ArgumentNullException.ThrowIfNull(endpoints);
        var options = endpoints.ServiceProvider.GetRequiredService<IOptions<DotReactOptions>>().Value;
        var endpoint = endpoints.MapPost(
                options.BrowserVitalsEndpointPath,
                (Func<HttpContext, Task<IResult>>)HandleAsync)
            .DisableAntiforgery();
        if (endpoints.ServiceProvider.GetService<DotReactRateLimitingRegistration>() is not null)
            endpoint.RequireRateLimiting(DotReactRateLimiting.WebVitalsPolicyName);
        return endpoint;
    }

    private static async Task<IResult> HandleAsync(HttpContext context)
    {
        if (context.Request.ContentLength is > MaxBodyBytes)
            return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);
        if (context.Request.ContentType is null
            || !context.Request.ContentType.StartsWith("application/json", StringComparison.OrdinalIgnoreCase))
            return Results.StatusCode(StatusCodes.Status415UnsupportedMediaType);

        var buffer = new byte[MaxBodyBytes + 1];
        var length = 0;
        while (length < buffer.Length)
        {
            var read = await context.Request.Body.ReadAsync(
                buffer.AsMemory(length, buffer.Length - length), context.RequestAborted).ConfigureAwait(false);
            if (read == 0) break;
            length += read;
        }
        if (length == 0) return Results.BadRequest();
        if (length > MaxBodyBytes) return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);

        BrowserVital? sample;
        try { sample = JsonSerializer.Deserialize<BrowserVital>(buffer.AsSpan(0, length), JsonOptions); }
        catch (JsonException) { return Results.BadRequest(); }
        if (sample is null || !TryNormalize(sample, out var name, out var rating, out var navigationType))
            return Results.BadRequest();

        var tags = new TagList
        {
            { "dotreact.rating", rating },
            { "dotreact.navigation_type", navigationType }
        };
        switch (name)
        {
            case "CLS": DotReactTelemetry.BrowserCls.Record(sample.Value, tags); break;
            case "INP": DotReactTelemetry.BrowserInp.Record(sample.Value, tags); break;
            case "LCP": DotReactTelemetry.BrowserLcp.Record(sample.Value, tags); break;
            case "TTFB": DotReactTelemetry.BrowserTtfb.Record(sample.Value, tags); break;
        }
        Activity.Current?.SetTag("dotreact.web_vital.name", name);
        Activity.Current?.SetTag("dotreact.web_vital.rating", rating);
        return Results.NoContent();
    }

    private static bool TryNormalize(
        BrowserVital sample,
        out string name,
        out string rating,
        out string navigationType)
    {
        name = sample.Name?.ToUpperInvariant() ?? string.Empty;
        navigationType = sample.NavigationType?.ToLowerInvariant() ?? string.Empty;
        var max = name == "CLS" ? 100d : 600_000d;
        var valid = name is "CLS" or "INP" or "LCP" or "TTFB"
            && double.IsFinite(sample.Value) && sample.Value >= 0 && sample.Value <= max
            && navigationType is "navigate" or "reload" or "back-forward" or "prerender" or "unknown";
        rating = valid ? Rate(name, sample.Value) : string.Empty;
        return valid;
    }

    private static string Rate(string name, double value)
    {
        var (good, poor) = name switch
        {
            "CLS" => (0.1, 0.25),
            "INP" => (200d, 500d),
            "LCP" => (2_500d, 4_000d),
            _ => (800d, 1_800d)
        };
        return value <= good ? "good" : value <= poor ? "needs-improvement" : "poor";
    }

    private sealed record BrowserVital(string? Name, double Value, string? Rating, string? NavigationType);
}
