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
                }
            ]
        });
        await using var app = await StartAppAsync(renderer, development: false, map: endpoints =>
            endpoints.MapDotReactPage("/products/{id}", "pages/product", context =>
                new ProductProps(context.Request.RouteValues["id"]!.ToString()!, "</script><script>alert(1)</script>")));

        var response = await app.GetTestClient().GetAsync("/products/42?currency=BRL");
        var html = await response.Content.ReadAsStringAsync();

        Assert.True(response.IsSuccessStatusCode);
        Assert.Contains("<title>Welcome &lt;unsafe&gt;</title>", html);
        Assert.Contains("<meta name=\"description\" content=\"A &quot;quoted&quot; value\">", html);
        Assert.DoesNotContain("onclick", html);
        Assert.Contains("<div id=\"app\"><h1>Hello</h1></div>", html);
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
    public async Task Development_shell_installs_vite_react_refresh_preamble_before_client_entry()
    {
        var renderer = new CapturingRenderer(new DotReactRenderResponse { Html = "<h1>Hello</h1>" });
        await using var app = await StartAppAsync(renderer, development: true, map: endpoints =>
            endpoints.MapDotReactPage("/", "pages/home", _ => new { Greeting = "hello" }));

        var html = await app.GetTestClient().GetStringAsync("/");
        var preamble = html.IndexOf("/@react-refresh", StringComparison.Ordinal);
        var client = html.IndexOf("/assets/client.js", StringComparison.Ordinal);

        Assert.True(preamble >= 0);
        Assert.True(client > preamble);
        Assert.Contains("__vite_plugin_react_preamble_installed__=true", html);
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
        TimeSpan? timeout = null)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddDotReact(options =>
        {
            options.Development = development;
            options.RequestTimeout = timeout ?? TimeSpan.FromSeconds(1);
            options.RootElementId = "app";
            options.ClientScriptSrc = "/assets/client.js";
            options.ReactRefreshPreambleSrc = development ? "http://127.0.0.1:5173/@react-refresh" : null;
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
