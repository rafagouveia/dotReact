using System.Net;
using System.Net.Http.Headers;
using System.Security.Claims;
using DotReact.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Xunit;

namespace DotReact.AspNetCore.Tests;

public sealed class DotReactSessionTests
{
    [Fact]
    public async Task Cookie_session_can_be_created_used_and_invalidated()
    {
        await using var app = await BuildAppAsync();
        var client = app.GetTestClient();

        using var login = await client.PostAsync("/login", content: null);
        var cookie = AuthenticationCookie(login);
        Assert.Contains("HttpOnly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=lax", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("secure", cookie, StringComparison.OrdinalIgnoreCase);

        using var authenticated = await SendWithCookieAsync(client, HttpMethod.Get, "/me", cookie);
        Assert.Equal(HttpStatusCode.OK, authenticated.StatusCode);
        Assert.Equal("user-42", await authenticated.Content.ReadAsStringAsync());

        using var logout = await SendWithCookieAsync(client, HttpMethod.Post, "/logout", cookie);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        using var replay = await SendWithCookieAsync(client, HttpMethod.Get, "/me", cookie);
        Assert.Equal(HttpStatusCode.Unauthorized, replay.StatusCode);
    }

    [Fact]
    public async Task Revoke_all_invalidates_every_session_issued_before_the_operation()
    {
        await using var app = await BuildAppAsync();
        var client = app.GetTestClient();
        var first = AuthenticationCookie(await client.PostAsync("/login", content: null));
        var second = AuthenticationCookie(await client.PostAsync("/login", content: null));

        using var revoked = await SendWithCookieAsync(client, HttpMethod.Post, "/revoke-all", first);
        Assert.Equal(HttpStatusCode.NoContent, revoked.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await SendWithCookieAsync(client, HttpMethod.Get, "/me", first)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await SendWithCookieAsync(client, HttpMethod.Get, "/me", second)).StatusCode);
    }

    [Fact]
    public async Task Renewal_rotates_the_session_and_rejects_the_previous_cookie()
    {
        await using var app = await BuildAppAsync();
        var client = app.GetTestClient();
        var previous = AuthenticationCookie(await client.PostAsync("/login", content: null));

        using var renewedResponse = await SendWithCookieAsync(client, HttpMethod.Post, "/renew", previous);
        var renewed = AuthenticationCookie(renewedResponse);

        Assert.NotEqual(previous.Split(';', 2)[0], renewed.Split(';', 2)[0]);
        Assert.Equal(HttpStatusCode.Unauthorized,
            (await SendWithCookieAsync(client, HttpMethod.Get, "/me", previous)).StatusCode);
        Assert.Equal(HttpStatusCode.OK,
            (await SendWithCookieAsync(client, HttpMethod.Get, "/me", renewed)).StatusCode);
    }

    [Fact]
    public async Task Framework_API_challenge_is_401_instead_of_a_login_redirect()
    {
        await using var app = await BuildAppAsync();

        using var response = await app.GetTestClient().GetAsync("/_dotreact/protected");

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        Assert.Null(response.Headers.Location);
        Assert.True(response.Headers.CacheControl?.Private);
        Assert.True(response.Headers.CacheControl?.NoStore);
    }

    [Fact]
    public void Invalid_or_excessive_session_configuration_fails_closed()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddOptions();
        services.AddSingleton<IHostEnvironment>(new TestEnvironment());
        services.AddDotReactCookieSessions(options =>
        {
            options.ProductionCookieName = "unsafe-cookie";
            options.Lifetime = TimeSpan.FromDays(365);
        });
        using var provider = services.BuildServiceProvider();

        Assert.Throws<OptionsValidationException>(() =>
            provider.GetRequiredService<IOptions<DotReactCookieSessionOptions>>().Value);
    }

    private static async Task<WebApplication> BuildAppAsync()
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = Environments.Development
        });
        builder.WebHost.UseTestServer();
        builder.Services.AddDotReactCookieSessions();
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapPost("/login", async (HttpContext context, IDotReactSessionManager sessions) =>
        {
            await sessions.SignInAsync(context, new DotReactSessionDescriptor(
                "user-42", "Ada", [new Claim(ClaimTypes.Role, "operator")]), context.RequestAborted);
            return Results.NoContent();
        }).AllowAnonymous();
        app.MapPost("/logout", async (HttpContext context, IDotReactSessionManager sessions) =>
        {
            await sessions.SignOutAsync(context, context.RequestAborted);
            return Results.NoContent();
        }).RequireAuthorization();
        app.MapPost("/revoke-all", async (HttpContext context, IDotReactSessionManager sessions) =>
        {
            await sessions.RevokeAllAsync(context, "user-42", context.RequestAborted);
            return Results.NoContent();
        }).RequireAuthorization();
        app.MapPost("/renew", async (HttpContext context, IDotReactSessionManager sessions) =>
        {
            await sessions.RenewAsync(context, new DotReactSessionDescriptor(
                "user-42", "Ada", [new Claim(ClaimTypes.Role, "administrator")]),
                context.RequestAborted);
            return Results.NoContent();
        }).RequireAuthorization();
        app.MapGet("/me", (ClaimsPrincipal user) => user.FindFirstValue(ClaimTypes.NameIdentifier))
            .RequireAuthorization();
        app.MapGet("/_dotreact/protected", () => Results.NoContent()).RequireAuthorization();
        await app.StartAsync();
        return app;
    }

    private static async Task<HttpResponseMessage> SendWithCookieAsync(
        HttpClient client,
        HttpMethod method,
        string path,
        string setCookie)
    {
        using var request = new HttpRequestMessage(method, path);
        request.Headers.Add("Cookie", setCookie.Split(';', 2)[0]);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        return await client.SendAsync(request);
    }

    private static string AuthenticationCookie(HttpResponseMessage response) =>
        Assert.Single(response.Headers.GetValues("Set-Cookie"), value =>
            value.StartsWith(".DotReact.Session=", StringComparison.Ordinal));

    private sealed class TestEnvironment : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = nameof(DotReactSessionTests);
        public string ContentRootPath { get; set; } = AppContext.BaseDirectory;
        public Microsoft.Extensions.FileProviders.IFileProvider ContentRootFileProvider { get; set; } =
            new Microsoft.Extensions.FileProviders.NullFileProvider();
    }
}
