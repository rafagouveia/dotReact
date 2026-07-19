using DotReact.AspNetCore;
using DotReact.Starter;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;

var builder = WebApplication.CreateBuilder(args);
var development = builder.Environment.IsDevelopment();
builder.Services.AddDotReact(options =>
{
    options.RendererUrl = new Uri(
        builder.Configuration["DOTREACT_RENDERER_URL"]
        ?? (development ? "http://127.0.0.1:5173" : "http://127.0.0.1:5178"));
    options.RendererToken = Environment.GetEnvironmentVariable("DOTREACT_RENDERER_TOKEN");
    options.RequireRendererToken = !development;
    options.ClientScriptSrc = development
        ? "http://127.0.0.1:5173/src/entry-client.tsx"
        : builder.Configuration["DOTREACT_CLIENT_SCRIPT_SRC"] ?? "/_dotreact/client.js";
    options.ReactRefreshPreambleSrc = development ? "http://127.0.0.1:5173/@react-refresh" : null;
    options.Development = development;
});
if (!development)
{
    var appDirectory = AppContext.BaseDirectory;
    builder.Services.AddDotReactNodeRenderer(options =>
    {
        options.ScriptPath = Path.Combine(appDirectory, "renderer", "production-server.js");
        options.ServerEntryPath = Path.Combine(appDirectory, "frontend", "server", "entry-server.js");
        options.WorkingDirectory = appDirectory;
        options.Port = 5178;
    });
}
builder.Services.AddDotReactPages(typeof(Program).Assembly);
builder.Services.AddDotReactActions(typeof(Program).Assembly);
builder.Services.AddDotReactSecurityHeaders();
var exportOpenTelemetry = !string.IsNullOrWhiteSpace(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]);
builder.Services.AddOpenTelemetry()
    .ConfigureResource(resource => resource.AddService(
        serviceName: builder.Environment.ApplicationName,
        serviceVersion: typeof(Program).Assembly.GetName().Version?.ToString()))
    .WithTracing(tracing =>
    {
        tracing.AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddSource(DotReactTelemetry.ActivitySourceName);
        if (exportOpenTelemetry) tracing.AddOtlpExporter();
    })
    .WithMetrics(metrics =>
    {
        metrics.AddAspNetCoreInstrumentation()
            .AddHttpClientInstrumentation()
            .AddMeter(DotReactTelemetry.MeterName, "DotReact.Hosting.Node");
        if (exportOpenTelemetry) metrics.AddOtlpExporter();
    });
if (!development)
    builder.Services.AddDotReactRateLimiting();

var app = builder.Build();
app.UseDotReactSecurityHeaders();
app.UseDotReactStaticFiles();
if (!development)
    app.UseRateLimiter();
app.MapDotReactHealthChecks();
app.MapDotReactPages();
app.MapDotReactActions();
app.MapDotReactFallback();

app.Run();

public partial class Program;
