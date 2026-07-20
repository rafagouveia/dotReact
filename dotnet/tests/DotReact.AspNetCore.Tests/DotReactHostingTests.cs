using DotReact.AspNetCore;
using DotReact.AspNetCore.Authentication;
using DotReact.Hosting;
using DotReact.Redis;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Xunit;

namespace DotReact.AspNetCore.Tests;

public sealed class DotReactHostingTests
{
    [Fact]
    public void Existing_application_authentication_is_not_replaced_by_the_hosting_facade()
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = Environments.Development
        });
        builder.Services.AddAuthentication(options =>
        {
            options.DefaultAuthenticateScheme = "application-owned";
            options.DefaultChallengeScheme = "application-owned";
        });

        builder.AddDotReactApplication(hosting =>
            hosting.ApplicationAssembly = typeof(DotReactApplicationOptions).Assembly);
        using var app = builder.Build();

        var authentication = app.Services.GetRequiredService<IOptions<AuthenticationOptions>>().Value;
        Assert.Equal("application-owned", authentication.DefaultAuthenticateScheme);
        Assert.Equal("application-owned", authentication.DefaultChallengeScheme);
    }

    [Fact]
    public void Hosting_derives_an_application_specific_redis_namespace()
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            ApplicationName = "Accounting.Arxis.Server",
            EnvironmentName = Environments.Development
        });
        builder.Configuration["DOTREACT_REDIS_CONNECTION"] = "127.0.0.1:6379,abortConnect=false";

        builder.AddDotReactApplication(hosting =>
            hosting.ApplicationAssembly = typeof(DotReactApplicationOptions).Assembly);
        using var app = builder.Build();

        var redis = app.Services.GetRequiredService<IOptions<DotReactRedisOptions>>().Value;
        Assert.Equal("dotreact.accounting.arxis.server", redis.KeyPrefix);
    }

    [Fact]
    public void DevelopmentFacadeAppliesViteHydrationAndStreamingDefaults()
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = Environments.Development
        });

        builder.AddDotReactApplication(hosting =>
            hosting.ApplicationAssembly = typeof(DotReactApplicationOptions).Assembly);
        using var app = builder.Build();
        app.UseDotReactApplication();
        app.MapDotReactApplication();

        var options = app.Services.GetRequiredService<IOptions<DotReactOptions>>().Value;
        Assert.True(options.Development);
        Assert.True(options.EnableStreaming);
        Assert.Equal("/_dotreact/dev/@id/virtual:dotreact/client-entry", options.ClientScriptSrc);
        Assert.Equal("/_dotreact/dev/src/styles.css", options.ClientStyleSrc);
        Assert.Equal("/_dotreact/dev/__dotreact_route_style.css?moduleKey={moduleKey}", options.ClientRouteStyleSrc);
        Assert.Equal("/_dotreact/dev/@react-refresh", options.ReactRefreshPreambleSrc);
        Assert.Equal("/_dotreact/dev/runtime", options.DevelopmentRuntimeProbePath);
        Assert.DoesNotContain("127.0.0.1", options.ClientScriptSrc, StringComparison.Ordinal);
        using var scope = app.Services.CreateScope();
        Assert.NotNull(scope.ServiceProvider.GetRequiredService<IDotReactSessionManager>());
        Assert.NotEmpty(((IEndpointRouteBuilder)app).DataSources);
    }

    [Fact]
    public void ProductionFacadeSupervisesRendererAndAcceptsAdvancedOverrides()
    {
        using var assets = ProductionAssets.Create();
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = Environments.Production
        });
        builder.Configuration["DOTREACT_CLIENT_ASSET_ROOT"] = assets.Root;

        builder.AddDotReactApplication(hosting =>
        {
            hosting.ApplicationAssembly = typeof(DotReactApplicationOptions).Assembly;
            hosting.ProductionRendererPort = 5199;
            hosting.ConfigureRuntime = runtime => runtime.PrerenderBuildId = "release-42";
        });
        using var app = builder.Build();

        var runtime = app.Services.GetRequiredService<IOptions<DotReactOptions>>().Value;
        var renderer = app.Services.GetRequiredService<IOptions<DotReactNodeRendererOptions>>().Value;
        var antiforgery = app.Services.GetRequiredService<IOptions<AntiforgeryOptions>>().Value;
        var sessionCookie = app.Services.GetRequiredService<IOptionsMonitor<CookieAuthenticationOptions>>()
            .Get(DotReactSessionDefaults.AuthenticationScheme);
        Assert.False(runtime.Development);
        Assert.True(runtime.RequireRendererToken);
        Assert.NotNull(runtime.RendererToken);
        Assert.Equal("release-42", runtime.PrerenderBuildId);
        var routeAssets = Assert.Single(runtime.ClientRouteAssets);
        Assert.Equal("app/page.drx", routeAssets.Key);
        Assert.Equal(["/_dotreact/global.css", "/_dotreact/page.css"], routeAssets.Value.Styles);
        Assert.Equal(["/_dotreact/client.js", "/_dotreact/page.js"], routeAssets.Value.ModulePreloads);
        Assert.Equal(5199, renderer.Port);
        Assert.EndsWith("production-server.js", renderer.ScriptPath, StringComparison.Ordinal);
        Assert.True(antiforgery.Cookie.HttpOnly);
        Assert.Equal(SameSiteMode.Strict, antiforgery.Cookie.SameSite);
        Assert.Equal(CookieSecurePolicy.Always, antiforgery.Cookie.SecurePolicy);
        Assert.Equal("__Host-DotReact.Session", sessionCookie.Cookie.Name);
        Assert.True(sessionCookie.Cookie.HttpOnly);
        Assert.Equal(SameSiteMode.Lax, sessionCookie.Cookie.SameSite);
        Assert.Equal(CookieSecurePolicy.Always, sessionCookie.Cookie.SecurePolicy);
        Assert.False(sessionCookie.SlidingExpiration);
    }

    private sealed class ProductionAssets : IDisposable
    {
        private ProductionAssets(string root) => Root = root;

        public string Root { get; }

        public static ProductionAssets Create()
        {
            var root = Path.Combine(Path.GetTempPath(), $"dotreact-assets-{Guid.NewGuid():N}");
            var vite = Directory.CreateDirectory(Path.Combine(root, ".vite")).FullName;
            File.WriteAllText(Path.Combine(vite, "manifest.json"), """
                {
                  "virtual:dotreact/client-entry": {
                    "file": "_dotreact/client.js",
                    "css": ["_dotreact/global.css"]
                  },
                  "app/page.drx": {
                    "file": "_dotreact/page.js",
                    "css": ["_dotreact/page.css"]
                  }
                }
                """);
            File.WriteAllText(Path.Combine(vite, "dotreact-routes.json"), """
                {
                  "version": 1,
                  "routes": [
                    { "moduleId": "app/page.drx", "modules": ["app/page.drx"] }
                  ]
                }
                """);
            return new(root);
        }

        public void Dispose()
        {
            if (Directory.Exists(Root)) Directory.Delete(Root, recursive: true);
        }
    }
}
