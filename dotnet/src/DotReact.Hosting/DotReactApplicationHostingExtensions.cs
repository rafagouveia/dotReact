using System.Reflection;
using System.IO.Compression;
using DotReact.AspNetCore;
using DotReact.AspNetCore.Authentication;
using DotReact.Redis;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Caching.StackExchangeRedis;
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
            options.EnableStreaming = ResolveBoolean(
                builder.Configuration,
                "DOTREACT_STREAMING_ENABLED",
                defaultValue: true);
            options.RendererMaxQueuedRequests = ResolveInteger(
                builder.Configuration,
                "DOTREACT_MAX_RENDER_QUEUE",
                options.RendererMaxQueuedRequests,
                minimum: -1,
                maximum: 10_000);
            options.PrerenderBuildId = ResolveBuildId(builder.Configuration, development);
            hosting.ConfigureRuntime?.Invoke(options);
        });

        var assemblies = DiscoverApplicationAssemblies(hosting, builder.Environment);
        builder.Services.AddDotReactPages(assemblies);
        builder.Services.AddDotReactActions(assemblies);
        builder.Services.AddDotReactSkiaSharpImages(options =>
            options.LocalRootPath = ResolvePublicPath(builder.Environment));
        builder.Services.AddDotReactSecurityHeaders();
        builder.Services.AddResponseCompression(options =>
        {
            options.EnableForHttps = true;
            options.Providers.Add<BrotliCompressionProvider>();
            options.Providers.Add<GzipCompressionProvider>();
            // Dynamic HTML and navigation payloads are generally small and are generated per
            // request. Compressing them on the application CPU costs more than it saves under
            // concurrency. Fingerprinted assets remain compressible and can also be cached at
            // the edge for a year.
            options.MimeTypes = ResponseCompressionDefaults.MimeTypes
                .Where(static mimeType => mimeType is not "text/html"
                    and not "application/json"
                    and not "text/json")
                .Concat(["application/javascript", "application/wasm", "image/svg+xml"])
                .Distinct(StringComparer.OrdinalIgnoreCase);
        });
        builder.Services.Configure<BrotliCompressionProviderOptions>(options =>
            options.Level = CompressionLevel.Fastest);
        builder.Services.Configure<GzipCompressionProviderOptions>(options =>
            options.Level = CompressionLevel.Fastest);
        if (!builder.Services.Any(descriptor => descriptor.ServiceType == typeof(IAuthenticationService)))
            builder.Services.AddDotReactCookieSessions();
        else
            builder.Services.AddAuthorization();
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
            builder.Services.PostConfigure<AntiforgeryOptions>(options =>
            {
                options.Cookie.HttpOnly = true;
                options.Cookie.SameSite = SameSiteMode.Strict;
                options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
            });
            var appDirectory = AppContext.BaseDirectory;
            builder.Services.AddDotReactNodeRenderer(options =>
            {
                options.ScriptPath = Path.Combine(appDirectory, "renderer", "production-server.js");
                options.ServerEntryPath = Path.Combine(appDirectory, "frontend", "server", "entry-server.js");
                options.WorkingDirectory = appDirectory;
                options.Port = hosting.ProductionRendererPort;
                options.UseInterprocessSocket = ResolveBoolean(
                    builder.Configuration,
                    "DOTREACT_RENDERER_IPC",
                    options.UseInterprocessSocket);
                options.SocketPath = OperatingSystem.IsWindows()
                    ? $@"\\.\pipe\dotreact-renderer-{Environment.ProcessId}-{options.Port}"
                    : Path.Combine(
                        Path.GetTempPath(), $"dotreact-renderer-{Environment.ProcessId}-{options.Port}.sock");
                options.FrameSocketPath = OperatingSystem.IsWindows()
                    ? $@"\\.\pipe\dotreact-renderer-{Environment.ProcessId}-{options.Port}-frames"
                    : Path.Combine(
                        Path.GetTempPath(), $"dotreact-renderer-{Environment.ProcessId}-{options.Port}-frames.sock");
                options.WorkerCount = ResolveInteger(
                    builder.Configuration,
                    "DOTREACT_RENDERER_WORKERS",
                    options.WorkerCount,
                    minimum: 1,
                    maximum: 32);
                options.MaxConcurrencyPerWorker = ResolveInteger(
                    builder.Configuration,
                    "DOTREACT_MAX_RENDER_CONCURRENCY",
                    options.MaxConcurrencyPerWorker,
                    minimum: 1,
                    maximum: 1_024);
                options.UseBinaryTransport = ResolveBoolean(
                    builder.Configuration,
                    "DOTREACT_RENDERER_BINARY_PROTOCOL",
                    options.UseBinaryTransport);
                options.UseFramedTransport = options.UseBinaryTransport && ResolveBoolean(
                    builder.Configuration,
                    "DOTREACT_RENDERER_FRAMED_PROTOCOL",
                    options.UseFramedTransport);
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
        var features = app.Services.GetRequiredService<DotReactHostingFeatures>();
        if (features.ProductionRuntime) app.UseHsts();
        if (features.ProductionRuntime) app.UseResponseCompression();
        app.UseDotReactSecurityHeaders();
        if (app.Services.GetRequiredService<IOptions<DotReactOptions>>().Value.Development)
        {
            app.UseWebSockets();
            app.UseMiddleware<DotReactDevelopmentProxyMiddleware>();
        }
        app.UseDotReactStaticFiles(ResolvePublicPath(app.Environment));
        if (features.ProductionRuntime)
            app.UseRateLimiter();
        app.UseAuthentication();
        app.UseAuthorization();
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
        if (string.IsNullOrWhiteSpace(connection))
        {
            // A single-instance application gets a zero-configuration bounded cache.
            // Multi-replica deployments replace it below with the shared Redis store.
            builder.Services.AddDistributedMemoryCache();
            builder.Services.AddDotReactDistributedCaching(options =>
                options.KeyPrefix = BuildRedisKeyPrefix(builder.Environment.ApplicationName) + ":pages:v1:");
            return;
        }
        var redis = ConfigurationOptions.Parse(connection);
        redis.AbortOnConnectFail = false;
        var configuredPrefix = builder.Configuration["DOTREACT_REDIS_KEY_PREFIX"];
        var keyPrefix = string.IsNullOrWhiteSpace(configuredPrefix)
            ? BuildRedisKeyPrefix(builder.Environment.ApplicationName)
            : configuredPrefix;
        builder.Services.AddDotReactRedis(redis, options => options.KeyPrefix = keyPrefix);
        builder.Services.AddStackExchangeRedisCache(options =>
            options.InstanceName = keyPrefix + ":cache:");
        // Reuse the framework multiplexer so sessions, idempotency and page cache
        // do not multiply outbound Redis connections per application instance.
        builder.Services.AddOptions<RedisCacheOptions>()
            .Configure<IConnectionMultiplexer>((options, multiplexer) =>
                options.ConnectionMultiplexerFactory = () => Task.FromResult(multiplexer));
        builder.Services.AddDotReactDistributedCaching(options =>
            options.KeyPrefix = keyPrefix + ":pages:v1:");
    }

    private static string BuildRedisKeyPrefix(string applicationName)
    {
        var safeName = new string(applicationName
            .Select(character => char.IsAsciiLetterOrDigit(character) || character is '.' or '_' or '-'
                ? char.ToLowerInvariant(character)
                : '-')
            .Take(48)
            .ToArray()).Trim('-', '.', '_');
        return $"dotreact.{(safeName.Length == 0 ? "app" : safeName)}";
    }

    private static void AddObservability(WebApplicationBuilder builder)
    {
        var export = !string.IsNullOrWhiteSpace(builder.Configuration["OTEL_EXPORTER_OTLP_ENDPOINT"]);
        // ActivitySource and Meter remain available to application-owned listeners. Avoid
        // installing the OpenTelemetry processing pipeline when there is no exporter: it
        // would allocate and process every ASP.NET/HttpClient span only to discard it.
        if (!export) return;
        builder.Services.AddOpenTelemetry()
            .ConfigureResource(resource => resource.AddService(
                serviceName: builder.Environment.ApplicationName,
                serviceVersion: Assembly.GetEntryAssembly()?.GetName().Version?.ToString()))
            .WithTracing(tracing =>
            {
                tracing.AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddSource(DotReactTelemetry.ActivitySourceName);
                tracing.AddOtlpExporter();
            })
            .WithMetrics(metrics =>
            {
                metrics.AddAspNetCoreInstrumentation()
                    .AddHttpClientInstrumentation()
                    .AddMeter(DotReactTelemetry.MeterName, "DotReact.Hosting.Node");
                metrics.AddOtlpExporter();
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

    private static bool ResolveBoolean(
        IConfiguration configuration,
        string key,
        bool defaultValue)
    {
        var configured = configuration[key];
        if (configured is null) return defaultValue;
        if (bool.TryParse(configured, out var enabled)) return enabled;
        throw new InvalidOperationException($"{key} must be true or false.");
    }

    private static int ResolveInteger(
        IConfiguration configuration,
        string key,
        int defaultValue,
        int minimum,
        int maximum)
    {
        var configured = configuration[key];
        if (configured is null) return defaultValue;
        if (int.TryParse(configured, System.Globalization.NumberStyles.None,
                System.Globalization.CultureInfo.InvariantCulture, out var value)
            && value >= minimum && value <= maximum)
            return value;
        throw new InvalidOperationException($"{key} must be an integer between {minimum} and {maximum}.");
    }

    private sealed record DotReactHostingFeatures(bool ProductionRuntime);
}
