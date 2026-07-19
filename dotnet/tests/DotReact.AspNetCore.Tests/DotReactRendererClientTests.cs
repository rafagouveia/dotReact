using System.Net;
using System.Text;
using System.Text.Json;
using DotReact.AspNetCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Http;
using Xunit;

namespace DotReact.AspNetCore.Tests;

public sealed class DotReactRendererClientTests
{
    [Fact]
    public async Task Client_posts_v1_protocol_with_token_and_web_json_defaults()
    {
        HttpRequestMessage? captured = null;
        string? requestBody = null;
        var handler = new DelegateHandler(async request =>
        {
            captured = request;
            requestBody = await request.Content!.ReadAsStringAsync();
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(
                    "{\"protocolVersion\":1,\"requestId\":\"req-1\",\"ok\":true,\"html\":\"<main>ok</main>\",\"head\":[]}",
                    Encoding.UTF8,
                    "application/json")
            };
        });
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddDotReact(options =>
        {
            options.RendererUrl = new Uri("https://renderer.example/base");
            options.RendererToken = "test-token";
        });
        services.AddSingleton<IHttpMessageHandlerBuilderFilter>(new HandlerFilter(handler));
        await using var provider = services.BuildServiceProvider();
        var client = provider.GetRequiredService<IDotReactRenderer>();
        var props = JsonSerializer.SerializeToElement(
            new { DisplayName = "Ada" },
            new JsonSerializerOptions(JsonSerializerDefaults.Web));

        var result = await client.RenderAsync(
            new DotReactRenderRequest(1, "req-1", "pages/home", "/", props, "ssr"),
            CancellationToken.None);

        Assert.Equal("<main>ok</main>", result.Html);
        Assert.Equal("https://renderer.example/base/__dotreact/render", captured!.RequestUri!.AbsoluteUri);
        Assert.Equal("Bearer", captured.Headers.Authorization!.Scheme);
        Assert.Equal("test-token", captured.Headers.Authorization.Parameter);
        Assert.Contains("\"protocolVersion\":1", requestBody);
        Assert.Contains("\"requestId\":\"req-1\"", requestBody);
        Assert.Contains("\"displayName\":\"Ada\"", requestBody);
        Assert.Contains("\"renderMode\":\"ssr\"", requestBody);
    }

    private sealed class DelegateHandler(Func<HttpRequestMessage, Task<HttpResponseMessage>> callback) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) => callback(request);
    }

    private sealed class HandlerFilter(HttpMessageHandler handler) : IHttpMessageHandlerBuilderFilter
    {
        public Action<HttpMessageHandlerBuilder> Configure(Action<HttpMessageHandlerBuilder> next) => builder =>
        {
            next(builder);
            builder.PrimaryHandler = handler;
        };
    }
}
