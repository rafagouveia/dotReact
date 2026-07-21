using System.Text.Json;
using DotReact.AspNetCore;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace DotReact.AspNetCore.Tests;

public sealed class DotReactEndpointTests
{
    [Fact]
    public async Task Page_renders_shell_and_safe_camel_case_hydration_payload()
    {
        var renderer = new CapturingRenderer(new DotReactRenderResponse
        {
            Html = "<h1>Hello</h1>",
            Head =
            [
                new DotReactHeadElement { Kind = "title", Content = "Welcome <unsafe>" },
                new DotReactHeadElement
                {
                    Kind = "meta",
                    Attrs = new Dictionary<string, string>
                    {
                        ["name"] = "description",
                        ["content"] = "A \"quoted\" value",
                        ["onclick"] = "alert(1)"
                    }
                },
                new DotReactHeadElement
                {
                    Kind = "script",
                    Attrs = new Dictionary<string, string>
                    {
                        ["src"] = "/scripts/consent.js",
                        ["defer"] = "",
                        ["onclick"] = "alert(1)"
                    }
                },
                new DotReactHeadElement
                {
                    Kind = "script",
                    Attrs = new Dictionary<string, string> { ["src"] = "javascript:alert(1)" }
                },
                new DotReactHeadElement
                {
                    Kind = "script",
                    Attrs = new Dictionary<string, string> { ["src"] = "https://cdn.example.test/untrusted.js" }
                },
                new DotReactHeadElement
                {
                    Kind = "script",
                    Attrs = new Dictionary<string, string>
                    {
                        ["src"] = "https://cdn.example.test/trusted.js",
                        ["integrity"] = $"sha384-{new string('a', 64)}"
                    }
                }
            ]
        });
        await using var app = await StartAppAsync(renderer, development: false, map: endpoints =>
            endpoints.MapDotReactPage("/products/{id}", "pages/product", context =>
                new ProductProps(context.Request.RouteValues["id"]!.ToString()!, "</script><script>alert(1)</script>")));

        var response = await app.GetTestClient().GetAsync("/products/42?currency=BRL");
        var html = await response.Content.ReadAsStringAsync();

        Assert.Contains("<html lang=\"en\">", html);
        Assert.True(response.IsSuccessStatusCode);
        Assert.Contains("<title>Welcome &lt;unsafe&gt;</title>", html);
        Assert.Contains("<meta name=\"description\" content=\"A &quot;quoted&quot; value\">", html);
        Assert.DoesNotContain("onclick", html);
        Assert.Contains("<script src=\"/scripts/consent.js\" defer=\"\"></script>", html);
        Assert.DoesNotContain("javascript:alert", html);
        Assert.DoesNotContain("untrusted.js", html);
        Assert.Contains("https://cdn.example.test/trusted.js", html);
        Assert.Contains("crossorigin=\"anonymous\"", html);
        Assert.Contains("<div id=\"app\"><h1>Hello</h1></div>", html);
        Assert.Contains("<link rel=\"stylesheet\" href=\"/assets/client.css\">", html);
        Assert.True(html.IndexOf("/assets/client.css", StringComparison.Ordinal)
            < html.IndexOf("<body>", StringComparison.Ordinal));
        Assert.Contains("src=\"/assets/client.js\"", html);
        Assert.Contains("\"productId\":\"42\"", html);
        Assert.DoesNotContain("</script><script>alert(1)</script>", html);
        Assert.Contains("\\u003C/script\\u003E", html);
        Assert.Equal(1, renderer.Request!.ProtocolVersion);
        Assert.Equal("pages/product", renderer.Request.ModuleId);
        Assert.Equal("/products/42?currency=BRL", renderer.Request.Url);
        Assert.Equal("ssr", renderer.Request.RenderMode);
        Assert.False(string.IsNullOrWhiteSpace(renderer.Request.RequestId));
    }

    [Fact]
    public async Task Production_error_does_not_expose_exception_or_stack()
    {
        var renderer = new ThrowingRenderer(new InvalidOperationException("secret database failure"));
        await using var app = await StartAppAsync(renderer, development: false, map: endpoints =>
            endpoints.MapDotReactPage("/", "pages/home", _ => new { Greeting = "hello" }));

        var response = await app.GetTestClient().GetAsync("/");
        var html = await response.Content.ReadAsStringAsync();

        Assert.Equal(System.Net.HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Contains("The page could not be rendered.", html);
        Assert.DoesNotContain("secret database failure", html);
        Assert.DoesNotContain("InvalidOperationException", html);
    }

    [Fact]
    public async Task Development_static_fallback_does_not_expose_exception_or_stack()
    {
        var renderer = new ThrowingRenderer(new InvalidOperationException("C:\\private\\source.cs secret"));
        await using var app = await StartAppAsync(renderer, development: true, map: endpoints =>
            endpoints.MapDotReactPage("/", "pages/home", _ => new { Greeting = "hello" }));

        var response = await app.GetTestClient().GetAsync("/");
        var html = await response.Content.ReadAsStringAsync();

        Assert.Equal(System.Net.HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Contains("The page could not be rendered.", html);
        Assert.DoesNotContain("private", html);
        Assert.DoesNotContain("InvalidOperationException", html);
    }

    [Fact]
    public async Task Unavailable_renderer_returns_retryable_service_unavailable_without_transport_details()
    {
        var renderer = new ThrowingRenderer(new DotReactRendererUnavailableException(
            "renderer unavailable", new HttpRequestException("127.0.0.1:5173 connection refused")));
        await using var app = await StartAppAsync(renderer, development: true, map: endpoints =>
            endpoints.MapDotReactPage("/", "pages/home", _ => new { Greeting = "hello" }));

        var response = await app.GetTestClient().GetAsync("/");
        var html = await response.Content.ReadAsStringAsync();

        Assert.Equal(System.Net.HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal(TimeSpan.FromSeconds(1), response.Headers.RetryAfter?.Delta);
        Assert.Contains("rendering service is restarting", html);
        Assert.DoesNotContain("127.0.0.1", html);
        Assert.DoesNotContain("HttpRequestException", html);
    }

    [Fact]
    public async Task Saturated_renderer_returns_retryable_service_unavailable_without_capacity_details()
    {
        var renderer = new ThrowingRenderer(new DotReactRendererCapacityException(
            "bounded queue contains internal capacity details"));
        await using var app = await StartAppAsync(renderer, development: false, map: endpoints =>
            endpoints.MapDotReactPage("/", "pages/home", _ => new { Greeting = "hello" }));

        var response = await app.GetTestClient().GetAsync("/");
        var html = await response.Content.ReadAsStringAsync();

        Assert.Equal(System.Net.HttpStatusCode.ServiceUnavailable, response.StatusCode);
        Assert.Equal(TimeSpan.FromSeconds(1), response.Headers.RetryAfter?.Delta);
        Assert.Contains("temporarily busy", html);
        Assert.DoesNotContain("internal capacity", html);
        Assert.DoesNotContain("DotReactRendererCapacityException", html);
    }

    [Fact]
    public async Task Development_shell_installs_vite_react_refresh_preamble_before_client_entry()
    {
        var renderer = new CapturingRenderer(new DotReactRenderResponse { Html = "<h1>Hello</h1>" });
        await using var app = await StartAppAsync(renderer, development: true, map: endpoints =>
            endpoints.MapDotReactPage("/", "pages/home", _ => new { Greeting = "hello" }));

        var response = await app.GetTestClient().GetAsync("/");
        var html = await response.Content.ReadAsStringAsync();
        var preamble = html.IndexOf("/@react-refresh", StringComparison.Ordinal);
        var client = html.IndexOf("/assets/client.js", StringComparison.Ordinal);

        Assert.True(preamble >= 0);
        Assert.True(client > preamble);
        Assert.Contains("__vite_plugin_react_preamble_installed__=true", html);
        Assert.Contains("new WebSocket(url)", html);
        Assert.Contains("document.visibilityState==='hidden'", html);
        Assert.Contains("window.addEventListener('pagehide'", html);
        Assert.DoesNotContain("fetch(\"/_dotreact/dev/runtime\"", html);
        Assert.DoesNotContain("setTimeout(__dotReactPollRuntime,250)", html);
        Assert.Contains("<link rel=\"stylesheet\" href=\"/_dotreact/dev/__dotreact_route_style.css?moduleKey=cGFnZXMvaG9tZQ\">", html);
        Assert.True(html.IndexOf("__dotreact_route_style.css", StringComparison.Ordinal)
            < html.IndexOf("<body>", StringComparison.Ordinal));
        Assert.Contains(response.Headers.GetValues("Server-Timing"), value => value.Contains("dotreact-loader", StringComparison.Ordinal));
        Assert.Contains(response.Headers.GetValues("Server-Timing"), value => value.Contains("dotreact-render", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Enum_props_are_serialized_as_strings_for_generated_typescript_contracts()
    {
        var renderer = new CapturingRenderer(new DotReactRenderResponse { Html = "<h1>Hello</h1>" });
        await using var app = await StartAppAsync(renderer, development: false, map: endpoints =>
            endpoints.MapDotReactPage("/", "pages/home", _ => new { Status = ExampleStatus.InProgress }));

        var html = await app.GetTestClient().GetStringAsync("/");

        Assert.Contains("\"status\":\"InProgress\"", html);
        Assert.Equal("InProgress", renderer.Request!.Props.GetProperty("status").GetString());
    }

    [Fact]
    public async Task Production_shell_blocks_on_route_css_and_preloads_only_the_current_route_modules()
    {
        var renderer = new CapturingRenderer(new DotReactRenderResponse { Html = "<h1>Hello</h1>" });
        var assets = new Dictionary<string, DotReactClientRouteAssets>(StringComparer.Ordinal)
        {
            ["pages/home"] = new(
                ["/assets/layout.css", "/assets/home.css"],
                ["/assets/layout.js", "/assets/home.js"]),
            ["pages/other"] = new(["/assets/other.css"], ["/assets/other.js"])
        };
        await using var app = await StartAppAsync(renderer, development: false, map: endpoints =>
            endpoints.MapDotReactPage("/", "pages/home", _ => new { Greeting = "hello" }),
            clientRouteAssets: assets);

        var html = await app.GetTestClient().GetStringAsync("/");
        var body = html.IndexOf("<body>", StringComparison.Ordinal);

        Assert.Contains("<link rel=\"modulepreload\" href=\"/assets/layout.js\">", html);
        Assert.Contains("<link rel=\"modulepreload\" href=\"/assets/home.js\">", html);
        Assert.Contains("<link rel=\"stylesheet\" href=\"/assets/layout.css\">", html);
        Assert.Contains("<link rel=\"stylesheet\" href=\"/assets/home.css\">", html);
        Assert.DoesNotContain("other.css", html);
        Assert.DoesNotContain("other.js", html);
        Assert.True(html.IndexOf("/assets/home.css", StringComparison.Ordinal) < body);
        Assert.True(html.IndexOf("/assets/home.js", StringComparison.Ordinal) < body);
    }

    [Fact]
    public async Task Proven_server_only_route_omits_hydration_payload_and_client_runtime()
    {
        var renderer = new CapturingRenderer(new DotReactRenderResponse { Html = "<h1>Server HTML</h1>" });
        var assets = new Dictionary<string, DotReactClientRouteAssets>(StringComparer.Ordinal)
        {
            ["pages/home"] = new(["/assets/home.css"], ["/assets/home.js"], Hydrate: false)
        };
        await using var app = await StartAppAsync(renderer, development: false, map: endpoints =>
            endpoints.MapDotReactPage("/", "pages/home", _ => new { Greeting = "hello" }),
            clientRouteAssets: assets);

        var html = await app.GetTestClient().GetStringAsync("/");

        Assert.Contains("<h1>Server HTML</h1>", html);
        Assert.Contains("href=\"/assets/home.css\"", html);
        Assert.DoesNotContain("__DOTREACT_DATA__", html);
        Assert.DoesNotContain("/assets/client.js", html);
        Assert.DoesNotContain("modulepreload", html);
    }

    [Fact]
    public async Task Oversized_props_are_rejected_before_the_renderer_and_reported_in_development()
    {
        var renderer = new CapturingRenderer(new DotReactRenderResponse { Html = "<h1>Unexpected</h1>" });
        await using var app = await StartAppAsync(renderer, development: true, map: endpoints =>
            endpoints.MapDotReactPage("/", "pages/home", _ => new { Value = new string('x', 2_048) }),
            maxSerializedPropsBytes: 1_024);

        var response = await app.GetTestClient().GetAsync("/");

        Assert.Equal(System.Net.HttpStatusCode.InternalServerError, response.StatusCode);
        Assert.Equal("error", renderer.Request?.BoundaryKind);
        Assert.False(renderer.Request!.Props.TryGetProperty("value", out _));
    }

    [Fact]
    public async Task Request_timeout_returns_gateway_timeout()
    {
        var renderer = new DelayingRenderer();
        await using var app = await StartAppAsync(renderer, development: false, timeout: TimeSpan.FromMilliseconds(25), map: endpoints =>
            endpoints.MapDotReactPage("/", "pages/home", _ => new { }));

        var response = await app.GetTestClient().GetAsync("/");

        Assert.Equal(System.Net.HttpStatusCode.GatewayTimeout, response.StatusCode);
        Assert.Contains("timed out", await response.Content.ReadAsStringAsync());
    }

    private static async Task<WebApplication> StartAppAsync(
        IDotReactRenderer renderer,
        bool development,
        Action<WebApplication> map,
        TimeSpan? timeout = null,
        int? maxSerializedPropsBytes = null,
        IReadOnlyDictionary<string, DotReactClientRouteAssets>? clientRouteAssets = null)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDotReact(options =>
        {
            options.Development = development;
            options.RequestTimeout = timeout ?? TimeSpan.FromSeconds(1);
            if (maxSerializedPropsBytes is not null)
                options.MaxSerializedPropsBytes = maxSerializedPropsBytes.Value;
            options.RootElementId = "app";
            options.ClientScriptSrc = "/assets/client.js";
            options.ClientStyleSrc = "/assets/client.css";
            options.ClientRouteStyleSrc = development
                ? "/_dotreact/dev/__dotreact_route_style.css?moduleKey={moduleKey}"
                : null;
            if (clientRouteAssets is not null) options.ClientRouteAssets = clientRouteAssets;
            options.ReactRefreshPreambleSrc = development ? "http://127.0.0.1:5173/@react-refresh" : null;
            options.DevelopmentRuntimeProbePath = development ? "/_dotreact/dev/runtime" : null;
        });
        builder.Services.AddSingleton(renderer);

        var app = builder.Build();
        map(app);
        await app.StartAsync();
        return app;
    }

    private sealed record ProductProps(string ProductId, string UnsafeValue);

    private enum ExampleStatus { Backlog, InProgress, Done }

    private sealed class CapturingRenderer(DotReactRenderResponse response) : IDotReactRenderer
    {
        public DotReactRenderRequest? Request { get; private set; }

        public Task<DotReactRenderResponse> RenderAsync(DotReactRenderRequest request, CancellationToken cancellationToken)
        {
            Request = request;
            return Task.FromResult(response with
            {
                ProtocolVersion = 1,
                RequestId = request.RequestId,
                Ok = true
            });
        }
    }

    private sealed class ThrowingRenderer(Exception exception) : IDotReactRenderer
    {
        public Task<DotReactRenderResponse> RenderAsync(DotReactRenderRequest request, CancellationToken cancellationToken) =>
            Task.FromException<DotReactRenderResponse>(exception);
    }

    private sealed class DelayingRenderer : IDotReactRenderer
    {
        public async Task<DotReactRenderResponse> RenderAsync(DotReactRenderRequest request, CancellationToken cancellationToken)
        {
            await Task.Delay(Timeout.InfiniteTimeSpan, cancellationToken);
            return new DotReactRenderResponse();
        }
    }
}
