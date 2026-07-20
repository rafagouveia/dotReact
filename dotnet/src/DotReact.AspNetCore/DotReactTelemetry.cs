using System.Diagnostics;
using System.Diagnostics.Metrics;

namespace DotReact.AspNetCore;

/// <summary>Stable instrumentation names consumed by OpenTelemetry and other listeners.</summary>
public static class DotReactTelemetry
{
    /// <summary>Activity source for renderer HTTP spans.</summary>
    public const string ActivitySourceName = "DotReact.AspNetCore";

    /// <summary>Meter for renderer HTTP metrics.</summary>
    public const string MeterName = "DotReact.AspNetCore";

    internal static readonly ActivitySource ActivitySource = new(ActivitySourceName, "1.0.0");
    internal static readonly Meter Meter = new(MeterName, "1.0.0");
    internal static readonly Counter<long> RendererRequests = Meter.CreateCounter<long>(
        "dotreact.renderer.http.requests", description: "Renderer HTTP requests initiated by ASP.NET Core.");
    internal static readonly Counter<long> RendererErrors = Meter.CreateCounter<long>(
        "dotreact.renderer.http.errors", description: "Renderer HTTP requests that failed or returned an error status.");
    internal static readonly Histogram<double> RendererDuration = Meter.CreateHistogram<double>(
        "dotreact.renderer.http.duration", unit: "s", description: "Renderer HTTP request duration.");
    internal static readonly Counter<long> ActionRequests = Meter.CreateCounter<long>(
        "dotreact.actions.requests", description: "Discovered DotReact Server Action requests.");
    internal static readonly Counter<long> ActionErrors = Meter.CreateCounter<long>(
        "dotreact.actions.errors", description: "DotReact Server Action requests ending in server errors.");
    internal static readonly Histogram<double> ActionDuration = Meter.CreateHistogram<double>(
        "dotreact.actions.duration", unit: "s", description: "DotReact Server Action duration including response serialization.");
    internal static readonly Histogram<long> PagePropsSize = Meter.CreateHistogram<long>(
        "dotreact.pages.props.size", unit: "By", description: "Serialized page props transferred across the C# and React boundary.");
    internal static readonly Histogram<double> BrowserCls = Meter.CreateHistogram<double>(
        "dotreact.browser.cls", unit: "1", description: "Browser Cumulative Layout Shift.");
    internal static readonly Histogram<double> BrowserInp = Meter.CreateHistogram<double>(
        "dotreact.browser.inp", unit: "ms", description: "Browser Interaction to Next Paint.");
    internal static readonly Histogram<double> BrowserLcp = Meter.CreateHistogram<double>(
        "dotreact.browser.lcp", unit: "ms", description: "Browser Largest Contentful Paint.");
    internal static readonly Histogram<double> BrowserTtfb = Meter.CreateHistogram<double>(
        "dotreact.browser.ttfb", unit: "ms", description: "Browser Time to First Byte.");

    internal static void RecordAction(
        long started,
        string actionId,
        string outcome,
        int? statusCode,
        Activity? activity,
        string? errorType = null)
    {
        var tags = new TagList
        {
            { "dotreact.action_id", actionId },
            { "dotreact.outcome", outcome }
        };
        if (statusCode is not null) tags.Add("http.response.status_code", statusCode.Value);
        if (errorType is not null) tags.Add("error.type", errorType);
        ActionDuration.Record(Stopwatch.GetElapsedTime(started).TotalSeconds, tags);
        activity?.SetTag("dotreact.outcome", outcome);
        if (statusCode is not null) activity?.SetTag("http.response.status_code", statusCode.Value);
        if (errorType is not null) activity?.SetTag("error.type", errorType);
        if (outcome == "error")
        {
            ActionErrors.Add(1, tags);
            activity?.SetStatus(ActivityStatusCode.Error);
        }
        activity?.Dispose();
    }
}
