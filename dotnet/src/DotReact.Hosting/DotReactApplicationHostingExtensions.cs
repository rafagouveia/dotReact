using System.Reflection;
using DotReact.AspNetCore;
using DotReact.Redis;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;
using OpenTelemetry.Trace;
using StackExchange.Redis;

namespace DotReact.Hosting;

/// <summary>
/// Provides the opinionated application boundary used by generated DotReact projects.
/// Lower-level ASP.NET Core registrations remain available for advanced hosts.
/// </summary>
public static class DotReactApplicationHostingExtensions
{
    /// <summary>
    /// Registers the renderer, discovery, actions, images, security, observability and
    /// optional distributed stores using production-safe conventions.
    /// </summary>
    public static WebApplicationBuilder AddDotReactApplication(
        this WebApplicationBuilder builder,
        Action<DotReactApplicationOptions>? configure = null)
    {
        ArgumentNullException.ThrowIfNull(builder);
        var hosting = new DotReactApplicationOptions();
        configure?.Invoke(hosting);
        if (hosting.ProductionRendererPort is <= 0 or > 65_535)
            throw new ArgumentOutOfRangeException(nameof(configure), "The production renderer port is invalid.");

        var development = builder.Environment.IsDevelopment();
        var productionRuntime = ResolveProductionRuntime(builder.Configuration, builder.Environment);
        var productionClientAssets = productionRuntime
            ? DotReactProductionAssetManifest.Load(ResolveProductionClientRoot(builder.Configuration))
            : null;
        builder.Services.AddSingleton(new DotReactHostingFeatures(productionRuntime));
        builder.Services.AddDotReact(options =>
        {
            options.RendererUrl = new Uri(
                builder.Configuration["DOTREACT_RENDERER_URL"]
                ?? (development ? "http://127.0.0.1:5173" : $"http://127.0.0.1:{hosting.ProductionRendererPort}"));
            options.RendererToken = builder.Configuration["DOTREACT_RENDERER_TOKEN"];
            options.RequireRendererToken = productionRuntime;
            options.ClientScriptSrc = development
                ? "/_dotreact/dev/@id/virtual:dotreact/client-entry"
                : builder.Configuration["DOTREACT_CLIENT_SCRIPT_SRC"] ?? "/_dotreact/client.js";
            options.ClientStyleSrc = development
                ? "/_dotreact/dev/src/styles.css"
                : builder.Configuration["DOTREACT_CLIENT_STYLE_SRC"];
            options.ClientRouteStyleSrc = development
                ? "/_dotreact/dev/__dotreact_route_style.css?moduleKey={moduleKey}"
                : null;
            options.ReactRefreshPreambleSrc = development ? "/_dotreact/dev/@react-refresh" : null;
            options.DevelopmentRuntimeProbePath = development ? "/_dotreact/dev/runtime" : null;
            if (productionClientAssets is not null)
                options.ClientRouteAssets = productionClientAssets;
            options.Development = development;
            options.EnableStreaming = true;
            options.PrerenderBuildId = ResolveBuildId(builder.Configuration, development);
            hosting.ConfigureRuntime?.Invoke(options);
        });

        var assemblies = DiscoverApplicationAssemblies(hosting, builder.Environment);
        builder.Services.AddDotReactPages(assemblies);
        builder.Services.AddDotReactActions(assemblies);
        builder.Services.AddDotReactSkiaSharpImages(options =>
            options.LocalRootPath = ResolvePublicPath(builder.Environment));
        builder.Services.AddDotReactSecurityHeaders();
        AddDistributedStores(builder);
        AddObservability(builder);

        if (development)
        {
            builder.Services.AddHttpClient(DotReactDevelopmentProxyMiddleware.HttpClientName, client =>
                client.Timeout = Timeout.InfiniteTimeSpan)
                .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
                {
                    AllowAutoRedirect = false,
                    UseCookies = false
                });
        }

        if (productionRuntime)
        {
            var appDirectory = AppContext.BaseDirectory;
            builder.Services.AddDotReactNodeRenderer(options =>
            {
                options.ScriptPath = Path.Combine(appDirectory, "renderer", "production-server.js");
                options.ServerEntryPath = Path.Combine(appDirectory, "frontend", "server", "entry-server.js");
                options.WorkingDirectory = appDirectory;
                options.Port = hosting.ProductionRendererPort;
                hosting.ConfigureNodeRenderer?.Invoke(options);
            });
            builder.Services.AddDotReactRateLimiting();
        }

        return builder;
    }

    /// <summary>Applies framework middleware before application authentication and endpoint mapping.</summary>
    public static WebApplication UseDotReactApplication(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);
        app.UseDotReactSecurityHeaders();
        if (app.Services.GetRequiredService<IOptions<DotReactOptions>>().Value.Development)
        {
            app.UseWebSockets();
            app.UseMiddleware<DotReactDevelopmentProxyMiddleware>();
        }
        app.UseDotReactStaticFiles(ResolvePublicPath(app.Environment));
        if (app.Services.GetRequiredService<DotReactHostingFeatures>().ProductionRuntime)
            app.UseRateLimiter();
        return app;
    }

    /// <summary>Maps the complete DotReact endpoint surface using the registered conventions.</summary>
    public static WebApplication MapDotReactApplication(this WebApplication app)
    {
        ArgumentNullException.ThrowIfNull(app);
        app.MapDotReactHealthChecks();
        if (app.Services.GetRequiredService<IOptions<DotReactOptions>>().Value.EnableBrowserVitals)
            app.MapDotReactWebVitals();
        app.MapDotReactPages();
        app.MapDotReactActions();
        app.MapDotReactImages();
        app.MapDotReactFallback();
        return app;
    }

    private static Assembly[] DiscoverApplicationAssemblies(
        DotReactApplicationOptions options,
        IHostEnvironment environment)
    {
        var entry = options.ApplicationAssembly ?? ResolveApplicationAssembly(environment)
            ?? throw new InvalidOperationException("The DotReact application entry assembly could not be resolved.");
        return options.FeatureAssemblies.Prepend(entry).Distinct().ToArray();
    }

    private static string ResolvePublicPath(IHostEnvironment environment)
    {
        var projectPublic = Path.GetFullPath(Path.Combine(environment.ContentRootPath, "..", "public"));
        return Directory.Exists(projectPublic)
            ? projectPublic
            : Path.Combine(environment.ContentRootPath, "wwwroot");
    }

    private static Assembly? ResolveApplicationAssembly(IHostEnvironment environment)
    {
        if (!string.IsNullOrWhiteSpace(environment.ApplicationName))
        {
            try { return Assembly.Load(new AssemblyName(environment.ApplicationName)); }
            catch (FileNotFoundException) { /* fall back to the process entry assembly */ }
        }
        return Assembly.GetEntryAssembly();
    }

    private static void AddDistributedStores(WebApplicationBuilder builder)
    {
        var connection = builder.Configuration["DOTREACT_REDIS_CONNECTION"];
        if (string.IsNullOrWhiteSpace(connection)) return;
        var redis = ConfigurationOptions.Parse(connection);
        redis.AbortOnConnectFail = false;
        builder.Services.AddDotReactRedis(redis);
    }

    private static void AddObservability(WebApplicationBuilder builder)
    {
        var export = !string.IsNullOrWhiteSpace(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]);
        builder.Services.AddOpenTelemetry()
            .ConfigureResource(resource => resource.AddService(
                serviceName: builder.Environment.ApplicationName,
                serviceVersion: Assembly.GetEntryAssembly()?.GetName().Version?.ToString()))
            .WithTracing(tracing =>
            {
                tracing.AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddSource(DotReactTelemetry.ActivitySourceName);
                if (export) tracing.AddOtlpExporter();
            })
            .WithMetrics(metrics =>
            {
                metrics.AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddMeter(DotReactTelemetry.MeterName, "DotReact.Hosting.Node");
                if (export) metrics.AddOtlpExporter();
            });
    }

    private static string ResolveBuildId(IConfiguration configuration, bool development) =>
        configuration["DOTREACT_BUILD_ID"]
        ?? configuration["CONTAINER_APP_REVISION"]
        ?? configuration["WEBSITE_DEPLOYMENT_ID"]
        ?? (development ? "development" : "local-production");

    private static string ResolveProductionClientRoot(IConfiguration configuration) =>
        Path.GetFullPath(configuration["DOTREACT_CLIENT_ASSET_ROOT"]
            ?? Path.Combine(AppContext.BaseDirectory, "wwwroot"));

    private static bool ResolveProductionRuntime(IConfiguration configuration, IHostEnvironment environment)
    {
        var configured = configuration["DOTREACT_PRODUCTION_RUNTIME"];
        if (configured is not null)
        {
            if (bool.TryParse(configured, out var enabled)) return enabled;
            throw new InvalidOperationException("DOTREACT_PRODUCTION_RUNTIME must be true or false.");
        }
        return !environment.IsDevelopment() && !environment.IsEnvironment("Testing");
    }

    private sealed record DotReactHostingFeatures(bool ProductionRuntime);
}
