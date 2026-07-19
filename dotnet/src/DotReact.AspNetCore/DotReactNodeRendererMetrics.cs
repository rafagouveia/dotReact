using System.Diagnostics.Metrics;

namespace DotReact.AspNetCore;

internal static class DotReactNodeRendererMetrics
{
    private static readonly Meter Meter = new("DotReact.Hosting.Node", "1.0.0");

    internal static readonly Counter<long> UnexpectedExits = Meter.CreateCounter<long>(
        "dotreact.renderer.unexpected_exits", description: "Unexpected Node renderer process exits.");

    internal static readonly Counter<long> Restarts = Meter.CreateCounter<long>(
        "dotreact.renderer.restarts", description: "Node renderer restart attempts.");

    internal static readonly Counter<long> RestartLimitExceeded = Meter.CreateCounter<long>(
        "dotreact.renderer.restart_limit_exceeded", description: "Renderer crash loops that stopped the host.");

    internal static readonly Histogram<double> StartupDuration = Meter.CreateHistogram<double>(
        "dotreact.renderer.startup.duration", unit: "s", description: "Time until the renderer reports readiness.");
}
