using System.Collections.Concurrent;
using System.Diagnostics;
using System.Diagnostics.Metrics;
using System.Net;
using System.Text;
using System.Text.Json;
using DotReact.AspNetCore;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http;
using Microsoft.Extensions.Options;
using Xunit;

namespace DotReact.AspNetCore.Tests;

[Collection("DotReact telemetry isolation")]
public sealed class DotReactSecurityObservabilityTests
{
    [Fact]
    public async Task Security_headers_use_strict_production_defaults()
    {
        await using var app = await BuildHeaderAppAsync(development: false);

        using var response = await app.GetTestClient().GetAsync("/");

        Assert.Equal("nosniff", Header(response, "X-Content-Type-Options"));
        Assert.Equal("DENY", Header(response, "X-Frame-Options"));
        Assert.Equal("no-referrer", Header(response, "Referrer-Policy"));
        Assert.Equal("same-origin", Header(response, "Cross-Origin-Opener-Policy"));
        var csp = Header(response, "Content-Security-Policy");
        Assert.Contains("default-src 'self'", csp);
        Assert.Contains("object-src 'none'", csp);
        Assert.Contains("frame-ancestors 'none'", csp);
        Assert.DoesNotContain("'unsafe-inline'", csp);
        Assert.DoesNotContain("127.0.0.1:5173", csp);
    }

    [Fact]
    public async Task Development_csp_allows_only_the_configured_vite_origin_and_websocket()
    {
        await using var app = await BuildHeaderAppAsync(development: true);

        using var response = await app.GetTestClient().GetAsync("/");
        var csp = Header(response, "Content-Security-Policy");

        Assert.Contains("http://127.0.0.1:5173", csp);
        Assert.Contains("ws://127.0.0.1:5173", csp);
        Assert.Contains("'unsafe-inline'", csp);
        Assert.DoesNotContain("src/entry-client.tsx", csp);
    }

    [Fact]
    public void Header_injection_is_rejected_by_options_validation()
    {
        var services = new ServiceCollection();
        services.AddDotReactSecurityHeaders(options =>
            options.ReferrerPolicy = "no-referrer\r\nX-Injected: true");
        using var provider = services.BuildServiceProvider();

        Assert.Throws<OptionsValidationException>(() =>
            provider.GetRequiredService<IOptions<DotReactSecurityHeadersOptions>>().Value);
    }

    [Fact]
    public async Task Registered_action_rate_limit_rejects_excess_requests_without_echoing_input()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddAuthorization();
        builder.Services.AddDotReact(options => options.ClientScriptSrc = "/client.js");
        builder.Services.AddDotReactActions(typeof(DotReactSecurityObservabilityTests).Assembly);
        builder.Services.AddDotReactRateLimiting(options =>
        {
            options.PermitLimit = 1;
            options.Window = TimeSpan.FromMinutes(1);
        });
        await using var app = builder.Build();
        app.UseRateLimiter();
        app.MapDotReactActions();
        await app.StartAsync();

        using var first = await app.GetTestClient().PostAsync(
            "/_dotreact/actions/security/rate-test",
            new StringContent("{\"value\":\"never-echo-this\"}", Encoding.UTF8, "application/json"));
        using var second = await app.GetTestClient().PostAsync(
            "/_dotreact/actions/security/rate-test",
            new StringContent("{\"value\":\"never-echo-this\"}", Encoding.UTF8, "application/json"));

        Assert.NotEqual(HttpStatusCode.TooManyRequests, first.StatusCode);
        Assert.Equal(HttpStatusCode.TooManyRequests, second.StatusCode);
        Assert.Equal("application/problem+json", second.Content.Headers.ContentType?.MediaType);
        Assert.DoesNotContain("never-echo-this", await second.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Renderer_telemetry_records_status_error_and_correlation_without_secrets()
    {
        const string token = "renderer-token-that-must-never-appear";
        const string secretProp = "private-prop-that-must-never-appear";
        var activities = new ConcurrentQueue<Activity>();
        var durations = new ConcurrentQueue<(double Value, KeyValuePair<string, object?>[] Tags)>();
        using var activityListener = new ActivityListener
        {
            ShouldListenTo = static source => source.Name == DotReactTelemetry.ActivitySourceName,
            Sample = static (ref ActivityCreationOptions<ActivityContext> _) => ActivitySamplingResult.AllData,
            ActivityStopped = activities.Enqueue
        };
        ActivitySource.AddActivityListener(activityListener);
        using var meterListener = new MeterListener();
        meterListener.InstrumentPublished = (instrument, listener) =>
        {
            if (instrument.Meter.Name == DotReactTelemetry.MeterName)
                listener.EnableMeasurementEvents(instrument);
        };
        meterListener.SetMeasurementEventCallback<double>((instrument, measurement, tags, _) =>
        {
            if (instrument.Name == "dotreact.renderer.http.duration")
                durations.Enqueue((measurement, tags.ToArray()));
        });
        meterListener.Start();

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddDotReact(options =>
        {
            options.RendererUrl = new Uri("https://renderer.invalid/");
            options.RendererToken = token;
        });
        services.AddSingleton<IHttpMessageHandlerBuilderFilter>(new HandlerFilter(new FailureHandler()));
        await using var provider = services.BuildServiceProvider();
        var renderer = provider.GetRequiredService<IDotReactRenderer>();
        var props = JsonSerializer.SerializeToElement(new { value = secretProp });
        using var parent = new Activity("request-parent").Start();

        await Assert.ThrowsAsync<DotReactRendererException>(() => renderer.RenderAsync(
            new DotReactRenderRequest(1, "sensitive-request-id", "secret/module", "/secret?q=value", props, "ssr"),
            CancellationToken.None));

        var rendererActivity = Assert.Single(activities, activity =>
            activity.DisplayName == "dotreact.renderer.render"
            && activity.ParentSpanId == parent.SpanId
            && activity.TraceId == parent.TraceId);
        Assert.Equal(parent.SpanId, rendererActivity.ParentSpanId);
        Assert.Equal(ActivityStatusCode.Error, rendererActivity.Status);
        Assert.Equal(503, rendererActivity.GetTagItem("http.response.status_code"));
        var activityText = string.Join('|', rendererActivity.TagObjects.Select(pair => $"{pair.Key}={pair.Value}"));
        Assert.DoesNotContain(token, activityText);
        Assert.DoesNotContain(secretProp, activityText);
        Assert.DoesNotContain("sensitive-request-id", activityText);
        Assert.DoesNotContain("secret/module", activityText);

        var duration = Assert.Single(durations, measurement =>
            measurement.Tags.Any(tag => tag.Key == "dotreact.outcome" && Equals(tag.Value, "error"))
            && measurement.Tags.Any(tag => tag.Key == "http.response.status_code" && Equals(tag.Value, 503)));
        Assert.True(duration.Value >= 0);
        Assert.Contains(duration.Tags, tag => tag.Key == "dotreact.operation" && Equals(tag.Value, "render"));
        Assert.Contains(duration.Tags, tag => tag.Key == "dotreact.outcome" && Equals(tag.Value, "error"));
        Assert.Contains(duration.Tags, tag => tag.Key == "http.response.status_code" && Equals(tag.Value, 503));
    }

    [Fact]
    public void Telemetry_exposes_stable_names_without_an_opentelemetry_dependency()
    {
        Assert.Equal("DotReact.AspNetCore", DotReactTelemetry.ActivitySourceName);
        Assert.Equal("DotReact.AspNetCore", DotReactTelemetry.MeterName);
    }

    [Fact]
    public async Task Action_telemetry_records_bounded_identity_outcome_and_status()
    {
        var durations = new ConcurrentQueue<KeyValuePair<string, object?>[]>();
        using var listener = new MeterListener();
        listener.InstrumentPublished = (instrument, meterListener) =>
        {
            if (instrument.Meter.Name == DotReactTelemetry.MeterName
                && instrument.Name == "dotreact.actions.duration")
                meterListener.EnableMeasurementEvents(instrument);
        };
        listener.SetMeasurementEventCallback<double>((_, _, tags, _) => durations.Enqueue(tags.ToArray()));
        listener.Start();

        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddAuthorization();
        builder.Services.AddDotReact(options => options.ClientScriptSrc = "/client.js");
        builder.Services.AddDotReactActions(typeof(DotReactSecurityObservabilityTests).Assembly);
        await using var app = builder.Build();
        app.MapDotReactActions();
        await app.StartAsync();

        using var response = await app.GetTestClient().PostAsync(
            "/_dotreact/actions/security/rate-test",
            new StringContent("{\"value\":\"not-recorded\"}", Encoding.UTF8, "application/json"));

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Contains("no-store", response.Headers.CacheControl?.ToString());
        var tags = Assert.Single(durations);
        Assert.Contains(tags, tag => tag.Key == "dotreact.action_id"
            && Equals(tag.Value, "security/rate-test"));
        Assert.Contains(tags, tag => tag.Key == "dotreact.outcome" && Equals(tag.Value, "rejected"));
        Assert.Contains(tags, tag => tag.Key == "http.response.status_code" && Equals(tag.Value, 400));
        Assert.DoesNotContain(tags, tag => Equals(tag.Value, "not-recorded"));
    }

    [Fact]
    public async Task Static_asset_policy_distinguishes_fingerprinted_and_stable_files()
    {
        var root = Path.Combine(Path.GetTempPath(), "dotreact-static-" + Guid.NewGuid().ToString("N"));
        var webRoot = Path.Combine(root, "wwwroot");
        Directory.CreateDirectory(Path.Combine(webRoot, "assets"));
        Directory.CreateDirectory(Path.Combine(webRoot, "_dotreact"));
        await File.WriteAllTextAsync(Path.Combine(webRoot, "assets", "app-abcdefgh.js"), "export {};\n");
        await File.WriteAllTextAsync(Path.Combine(webRoot, "_dotreact", "client.js"), "export {};\n");
        try
        {
            var builder = WebApplication.CreateBuilder(new WebApplicationOptions { WebRootPath = webRoot });
            builder.WebHost.UseTestServer();
            await using var app = builder.Build();
            app.UseDotReactStaticFiles();
            await app.StartAsync();

            using var immutable = await app.GetTestClient().GetAsync("/assets/app-abcdefgh.js");
            using var stable = await app.GetTestClient().GetAsync("/_dotreact/client.js");

            Assert.Equal("public, max-age=31536000, immutable", immutable.Headers.CacheControl?.ToString());
            Assert.True(stable.Headers.CacheControl?.Public);
            Assert.True(stable.Headers.CacheControl?.MustRevalidate);
            Assert.Equal(TimeSpan.Zero, stable.Headers.CacheControl?.MaxAge);
            Assert.Contains("Accept-Encoding", immutable.Headers.Vary);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static async Task<WebApplication> BuildHeaderAppAsync(bool development)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDotReact(options =>
        {
            options.ClientScriptSrc = development
                ? "http://127.0.0.1:5173/src/entry-client.tsx"
                : "/_dotreact/client.js";
            options.ReactRefreshPreambleSrc = development ? "http://127.0.0.1:5173/@react-refresh" : null;
            options.Development = development;
        });
        builder.Services.AddDotReactSecurityHeaders();
        var app = builder.Build();
        app.UseDotReactSecurityHeaders();
        app.MapGet("/", () => Results.Ok());
        await app.StartAsync();
        return app;
    }

    private static string Header(HttpResponseMessage response, string name) =>
        Assert.Single(response.Headers.GetValues(name));

    private sealed class FailureHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken) => Task.FromResult(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
        {
            Content = new StringContent(
                "{\"protocolVersion\":1,\"requestId\":\"sensitive-request-id\",\"ok\":false," +
                "\"error\":{\"code\":\"RENDER_FAILED\",\"message\":\"generic\"}}",
                Encoding.UTF8,
                "application/json")
        });
    }

    private sealed class HandlerFilter(HttpMessageHandler handler) : IHttpMessageHandlerBuilderFilter
    {
        public Action<HttpMessageHandlerBuilder> Configure(Action<HttpMessageHandlerBuilder> next) => builder =>
        {
            next(builder);
            builder.PrimaryHandler = handler;
        };
    }

    [DotReactAction("security/rate-test")]
    [AllowAnonymous]
    public sealed class RateLimitedAction : IDotReactAction<RateLimitedRequest, RateLimitedResponse>
    {
        public ValueTask<DotReactActionResult<RateLimitedResponse>> ExecuteAsync(
            RateLimitedRequest request,
            CancellationToken cancellationToken) => ValueTask.FromResult(
                DotReactActionResult<RateLimitedResponse>.Success(new(request.Value)));
    }

    public sealed record RateLimitedRequest(string Value);
    public sealed record RateLimitedResponse(string Value);
}

[CollectionDefinition("DotReact telemetry isolation", DisableParallelization = true)]
public sealed class DotReactTelemetryIsolationCollection;
