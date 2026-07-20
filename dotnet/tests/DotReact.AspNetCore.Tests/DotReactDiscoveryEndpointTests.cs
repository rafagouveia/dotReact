using System.Net;
using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.RegularExpressions;
using DotReact.AspNetCore;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace DotReact.AspNetCore.Tests;

public sealed partial class DotReactDiscoveryEndpointTests
{
    [Fact]
    public async Task Discovered_dynamic_page_converts_route_and_emits_csrf_token_and_cookie()
    {
        await using var app = await StartAsync();
        var response = await app.GetTestClient().GetAsync("/discovered/42");
        var html = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Contains("\"id\":42", html);
        Assert.Matches("<meta name=\"dotreact-csrf-token\" content=\"[^\"]+\">", html);
        Assert.Contains("csrfToken", html);
        Assert.Contains(response.Headers.GetValues("Set-Cookie"), value => value.Contains(".AspNetCore.Antiforgery", StringComparison.Ordinal));
    }

    [Fact]
    public async Task Client_navigation_returns_typed_props_without_invoking_the_renderer()
    {
        var renderer = new CountingRenderer();
        await using var app = await StartAsync(renderer);
        using var request = new HttpRequestMessage(HttpMethod.Get, "/discovered/42");
        request.Headers.Add("X-DotReact-Navigation", "1");
        request.Headers.Accept.ParseAdd("application/vnd.dotreact.navigation+json");

        var response = await app.GetTestClient().SendAsync(request);
        using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("application/vnd.dotreact.navigation+json", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("pages/discovered", payload.RootElement.GetProperty("moduleId").GetString());
        Assert.Equal(42, payload.RootElement.GetProperty("props").GetProperty("id").GetInt32());
        Assert.Equal(0, renderer.CallCount);
    }

    [Fact]
    public async Task Result_page_preserves_allowed_status_and_renders_props()
    {
        var renderer = new CountingRenderer();
        await using var app = await StartAsync(renderer);

        var response = await app.GetTestClient().GetAsync("/result/status");
        var html = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.UnprocessableEntity, response.StatusCode);
        Assert.Contains("\"id\":422", html);
        Assert.Equal(1, renderer.CallCount);
    }

    [Theory]
    [InlineData("/result/redirect", HttpStatusCode.TemporaryRedirect)]
    [InlineData("/result/redirect-permanent", HttpStatusCode.PermanentRedirect)]
    public async Task Result_page_redirects_locally_without_calling_renderer(
        string requestPath,
        HttpStatusCode expectedStatus)
    {
        var renderer = new CountingRenderer();
        await using var app = await StartAsync(renderer);

        var response = await app.GetTestClient().GetAsync(requestPath);

        Assert.Equal(expectedStatus, response.StatusCode);
        Assert.Equal("/discovered/7?from=result", response.Headers.Location?.OriginalString);
        Assert.Equal(0, renderer.CallCount);
    }

    [Fact]
    public async Task Result_page_not_found_renders_the_react_boundary()
    {
        var renderer = new CountingRenderer();
        await using var app = await StartAsync(renderer);

        var response = await app.GetTestClient().GetAsync("/result/missing");
        var html = await response.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Contains("<main>", html);
        Assert.Equal(1, renderer.CallCount);
        Assert.Equal("not-found", renderer.LastRequest?.BoundaryKind);
    }

    [Fact]
    public async Task Client_navigation_not_found_returns_boundary_payload_without_renderer()
    {
        var renderer = new CountingRenderer();
        await using var app = await StartAsync(renderer);
        using var request = new HttpRequestMessage(HttpMethod.Get, "/result/missing");
        request.Headers.Add("X-DotReact-Navigation", "1");
        request.Headers.Accept.ParseAdd("application/vnd.dotreact.navigation+json");

        var response = await app.GetTestClient().SendAsync(request);
        using var payload = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("not-found", payload.RootElement.GetProperty("boundaryKind").GetString());
        Assert.Equal(404, payload.RootElement.GetProperty("props").GetProperty("statusCode").GetInt32());
        Assert.Equal(0, renderer.CallCount);
    }

    [Theory]
    [InlineData("https://example.com/")]
    [InlineData("//example.com/")]
    [InlineData("/\\example.com/")]
    [InlineData("/safe\r\nLocation: https://example.com")]
    public void Result_page_rejects_external_or_ambiguous_redirects(string location) =>
        Assert.Throws<ArgumentException>(() => DotReactPageResult<PageProps>.Redirect(location));

    [Theory]
    [InlineData(199)]
    [InlineData(204)]
    [InlineData(302)]
    [InlineData(600)]
    public void Result_page_rejects_statuses_that_cannot_render_an_html_body(int statusCode) =>
        Assert.Throws<ArgumentOutOfRangeException>(() =>
            DotReactPageResult<PageProps>.Page(new PageProps(1), statusCode));

    [Fact]
    public void Repeated_page_or_action_discovery_rejects_collisions()
    {
        var pages = new ServiceCollection();
        pages.AddDotReactPages(typeof(DotReactDiscoveryEndpointTests).Assembly);
        Assert.Throws<InvalidOperationException>(() =>
            pages.AddDotReactPages(typeof(DotReactDiscoveryEndpointTests).Assembly));

        var actions = new ServiceCollection();
        actions.AddDotReactActions(typeof(DotReactDiscoveryEndpointTests).Assembly);
        Assert.Throws<InvalidOperationException>(() =>
            actions.AddDotReactActions(typeof(DotReactDiscoveryEndpointTests).Assembly));
    }

    [Fact]
    public void Multi_assembly_registration_discovers_all_candidates_and_page_authorization_metadata()
    {
        var services = new ServiceCollection();
        services.AddAuthorization();
        services.AddDotReact(options => options.ClientScriptSrc = "/client.js");
        services.AddDotReactPages([
            typeof(DotReactDiscoveryEndpointTests).Assembly,
            typeof(DotReactPageAttribute).Assembly
        ]);
        services.AddDotReactActions([
            typeof(DotReactDiscoveryEndpointTests).Assembly,
            typeof(DotReactActionAttribute).Assembly
        ]);

        Assert.NotEmpty(services);
    }

    [Theory]
    [InlineData("page", "/")]
    [InlineData("products/[id]/page", "/products/{id}")]
    [InlineData("(shop)/products/[id]/page", "/products/{id}")]
    [InlineData("docs/[...slug]/page", "/docs/{**slug}")]
    public void Route_convention_maps_canonical_page_modules(string moduleId, string pattern) =>
        Assert.Equal(pattern, DotReactRouteConvention.InferPattern(moduleId));

    [Theory]
    [InlineData("products")]
    [InlineData("../page")]
    [InlineData("products/[bad-name]/page")]
    [InlineData("products/[id]/[id]/page")]
    public void Route_convention_rejects_ambiguous_or_unsafe_modules(string moduleId) =>
        Assert.Throws<ArgumentException>(() => DotReactRouteConvention.InferPattern(moduleId));

    [Fact]
    public async Task Action_get_and_unknown_post_are_not_found()
    {
        await using var app = await StartAsync();
        var client = app.GetTestClient();

        Assert.Equal(HttpStatusCode.NotFound, (await client.GetAsync("/_dotreact/actions/test/outcome")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await client.PostAsJsonAsync("/_dotreact/actions/not-registered", new { })).StatusCode);
    }

    [Fact]
    public async Task Health_endpoints_separate_host_liveness_from_renderer_readiness()
    {
        await using var app = await StartAsync();
        var client = app.GetTestClient();

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/_health/live")).StatusCode);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, (await client.GetAsync("/_health/ready")).StatusCode);
    }

    [Fact]
    public async Task Action_rejects_missing_csrf_with_problem_details()
    {
        await using var app = await StartAsync();
        var response = await app.GetTestClient().PostAsJsonAsync(
            "/_dotreact/actions/test/outcome", new ActionRequest("success"));
        var problem = await response.Content.ReadFromJsonAsync<Dictionary<string, object>>();

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
        Assert.Contains("Invalid antiforgery token", problem!["title"].ToString());
    }

    [Theory]
    [InlineData("success", HttpStatusCode.OK)]
    [InlineData("validation", HttpStatusCode.BadRequest)]
    [InlineData("missing", HttpStatusCode.NotFound)]
    [InlineData("conflict", HttpStatusCode.Conflict)]
    public async Task Action_accepts_page_csrf_and_maps_structured_results(string mode, HttpStatusCode expected)
    {
        await using var app = await StartAsync();
        var client = app.GetTestClient();
        var page = await client.GetAsync("/discovered/1");
        var html = await page.Content.ReadAsStringAsync();
        var token = CsrfMetaRegex().Match(html).Groups[1].Value;
        var cookie = page.Headers.GetValues("Set-Cookie").Single(value =>
            value.Contains(".AspNetCore.Antiforgery", StringComparison.Ordinal)).Split(';')[0];
        using var request = new HttpRequestMessage(HttpMethod.Post, "/_dotreact/actions/test/outcome")
        {
            Content = JsonContent.Create(new ActionRequest(mode))
        };
        request.Headers.Add("X-DotReact-CSRF", token);
        request.Headers.Add("Cookie", cookie);

        var response = await client.SendAsync(request);

        Assert.Equal(expected, response.StatusCode);
        if (expected != HttpStatusCode.OK)
            Assert.Equal("application/problem+json", response.Content.Headers.ContentType!.MediaType);
    }

    [Fact]
    public async Task Action_accepts_progressive_form_posts_and_redirects_locally()
    {
        await using var app = await StartAsync();
        var client = app.GetTestClient();
        var page = await client.GetAsync("/discovered/1");
        var html = await page.Content.ReadAsStringAsync();
        var token = CsrfMetaRegex().Match(html).Groups[1].Value;
        var cookie = page.Headers.GetValues("Set-Cookie").Single(value =>
            value.Contains(".AspNetCore.Antiforgery", StringComparison.Ordinal)).Split(';')[0];
        using var request = new HttpRequestMessage(HttpMethod.Post, "/_dotreact/actions/test/outcome")
        {
            Content = new FormUrlEncodedContent(new Dictionary<string, string>
            {
                ["Mode"] = "success",
                ["__RequestVerificationToken"] = token,
                ["_dotreact_return"] = "/discovered/1"
            })
        };
        request.Headers.Add("Cookie", cookie);

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Redirect, response.StatusCode);
        Assert.Equal("/discovered/1", response.Headers.Location?.OriginalString);
    }

    [Fact]
    public async Task Discovered_actions_require_authorization_unless_explicitly_anonymous()
    {
        await using var app = await StartAsync();
        var endpoints = ((IEndpointRouteBuilder)app).DataSources
            .SelectMany(source => source.Endpoints).OfType<RouteEndpoint>().ToArray();
        var protectedEndpoint = endpoints.Single(endpoint => endpoint.RoutePattern.RawText == "/_dotreact/actions/test/protected");
        var anonymousEndpoint = endpoints.Single(endpoint => endpoint.RoutePattern.RawText == "/_dotreact/actions/test/outcome");

        Assert.NotEmpty(protectedEndpoint.Metadata.GetOrderedMetadata<IAuthorizeData>());
        Assert.NotNull(anonymousEndpoint.Metadata.GetMetadata<IAllowAnonymous>());
        var protectedPage = endpoints.Single(endpoint => endpoint.RoutePattern.RawText == "/pages/protected");
        Assert.Contains(protectedPage.Metadata.GetOrderedMetadata<IAuthorizeData>(),
            data => data.Policy == "pages.read");
    }

    [Fact]
    public async Task Resource_policy_receives_loaded_domain_resource_and_denies_before_execution()
    {
        await using var app = await StartAsync();
        var client = app.GetTestClient();
        var security = await GetActionSecurityAsync(client);

        using var allowed = CreateJsonActionRequest("/_dotreact/actions/test/resource",
            new ResourceRequest(7), security);
        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(allowed)).StatusCode);

        using var denied = CreateJsonActionRequest("/_dotreact/actions/test/resource",
            new ResourceRequest(8), security);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.SendAsync(denied)).StatusCode);
        Assert.Equal(1, app.Services.GetRequiredService<ResourceInvocationCounter>().Count);
    }

    [Fact]
    public async Task Distributed_page_cache_is_invalidated_automatically_after_successful_action()
    {
        await using var app = await StartAsync(enableDistributedCache: true);
        var client = app.GetTestClient();

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/cache/items")).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/cache/items")).StatusCode);
        Assert.Equal(1, app.Services.GetRequiredService<CacheInvocationCounter>().Count);

        var security = await GetActionSecurityAsync(client);
        using var invalidate = CreateJsonActionRequest("/_dotreact/actions/test/invalidate-cache",
            new ActionRequest("invalidate"), security);
        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(invalidate)).StatusCode);

        Assert.Equal(HttpStatusCode.OK, (await client.GetAsync("/cache/items")).StatusCode);
        Assert.Equal(2, app.Services.GetRequiredService<CacheInvocationCounter>().Count);
    }

    [Fact]
    public async Task Fresh_prerender_hit_skips_loader_and_never_issues_antiforgery_state()
    {
        var renderer = new CountingRenderer();
        await using var app = await StartAsync(renderer);
        var client = app.GetTestClient();

        var first = await client.GetAsync("/prerender/stable");
        var firstHtml = await first.Content.ReadAsStringAsync();
        var second = await client.GetAsync("/prerender/stable");
        var secondHtml = await second.Content.ReadAsStringAsync();

        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        Assert.Equal("Generated", first.Headers.GetValues("X-DotReact-Prerender").Single());
        Assert.Equal("Fresh", second.Headers.GetValues("X-DotReact-Prerender").Single());
        Assert.Equal(firstHtml, secondHtml);
        Assert.Contains("prerender-", firstHtml);
        Assert.DoesNotContain("csrf", firstHtml, StringComparison.OrdinalIgnoreCase);
        Assert.False(first.Headers.TryGetValues("Set-Cookie", out _));
        Assert.False(second.Headers.TryGetValues("Set-Cookie", out _));
        Assert.Equal(1, renderer.CallCount);
        Assert.Equal(1, app.Services.GetRequiredService<PrerenderInvocationCounter>().Count);
    }

    [Fact]
    public async Task Prerender_manifest_expands_typed_dynamic_path_providers()
    {
        await using var app = await StartAsync();

        var response = await app.GetTestClient().GetAsync("/_dotreact/prerender-manifest");
        using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var routes = document.RootElement.GetProperty("routes").EnumerateArray()
            .Select(item => item.GetProperty("path").GetString()).ToArray();

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal(1, document.RootElement.GetProperty("version").GetInt32());
        Assert.Contains("/prerender/stable", routes);
        Assert.Contains("/prerender/10", routes);
        Assert.Contains("/prerender/11", routes);
    }

    [Fact]
    public async Task Idempotent_action_coalesces_and_replays_the_first_byte_response()
    {
        await using var app = await StartAsync();
        var client = app.GetTestClient();
        var security = await GetActionSecurityAsync(client);

        using var firstRequest = CreateJsonActionRequest("/_dotreact/actions/test/idempotent",
            new ActionRequest("same"), security, "request-00000001");
        using var secondRequest = CreateJsonActionRequest("/_dotreact/actions/test/idempotent",
            new ActionRequest("same"), security, "request-00000001");
        var responses = await Task.WhenAll(client.SendAsync(firstRequest), client.SendAsync(secondRequest));
        var bodies = await Task.WhenAll(responses.Select(response => response.Content.ReadAsByteArrayAsync()));

        Assert.All(responses, response => Assert.Equal(HttpStatusCode.OK, response.StatusCode));
        Assert.Equal(bodies[0], bodies[1]);
        Assert.Contains(responses, response => response.Headers.GetValues("Idempotency-Replayed").Single() == "true");
        Assert.All(responses, response => Assert.Equal(
            Uri.EscapeDataString("/discovered/1"),
            response.Headers.GetValues("X-DotReact-Revalidate").Single()));
        Assert.Equal(1, app.Services.GetRequiredService<InvocationCounter>().Count);
    }

    [Fact]
    public async Task Idempotent_action_rejects_missing_key_and_payload_reuse()
    {
        await using var app = await StartAsync();
        var client = app.GetTestClient();
        var security = await GetActionSecurityAsync(client);

        using var missing = CreateJsonActionRequest("/_dotreact/actions/test/idempotent",
            new ActionRequest("one"), security);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.SendAsync(missing)).StatusCode);

        using var first = CreateJsonActionRequest("/_dotreact/actions/test/idempotent",
            new ActionRequest("one"), security, "request-00000002");
        Assert.Equal(HttpStatusCode.OK, (await client.SendAsync(first)).StatusCode);
        using var conflicting = CreateJsonActionRequest("/_dotreact/actions/test/idempotent",
            new ActionRequest("different"), security, "request-00000002");
        Assert.Equal(HttpStatusCode.Conflict, (await client.SendAsync(conflicting)).StatusCode);
        Assert.Equal(1, app.Services.GetRequiredService<InvocationCounter>().Count);
    }

    [Fact]
    public async Task Action_rejects_chunked_or_declared_bodies_over_the_configured_limit()
    {
        await using var app = await StartAsync(
            configureActions: actionOptions => actionOptions.MaxRequestBodyBytes = 32);
        var client = app.GetTestClient();
        var security = await GetActionSecurityAsync(client);
        using var request = CreateJsonActionRequest("/_dotreact/actions/test/idempotent",
            new ActionRequest(new string('x', 64)), security, "request-00000003");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.RequestEntityTooLarge, response.StatusCode);
        Assert.Equal(0, app.Services.GetRequiredService<InvocationCounter>().Count);
    }

    private static async Task<WebApplication> StartAsync(
        IDotReactRenderer? renderer = null,
        Action<DotReactActionOptions>? configureActions = null,
        bool enableDistributedCache = false)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddAuthentication(TestAuthenticationHandler.AuthenticationSchemeName)
            .AddScheme<AuthenticationSchemeOptions, TestAuthenticationHandler>(
                TestAuthenticationHandler.AuthenticationSchemeName, _ => { });
        builder.Services.AddAuthorization(options =>
        {
            options.AddPolicy("pages.read", policy => policy.RequireAuthenticatedUser());
            options.AddPolicy("resource.allowed", policy => policy.RequireAssertion(context =>
                context.Resource is ResourceRecord { Id: 7 }));
        });
        builder.Services.AddDotReact(options => options.ClientScriptSrc = "/client.js");
        builder.Services.AddDotReactPages(typeof(DotReactDiscoveryEndpointTests).Assembly);
        builder.Services.AddDotReactActions(typeof(DotReactDiscoveryEndpointTests).Assembly);
        if (configureActions is not null) builder.Services.Configure(configureActions);
        builder.Services.AddSingleton<InvocationCounter>();
        builder.Services.AddSingleton<ResourceInvocationCounter>();
        builder.Services.AddSingleton<CacheInvocationCounter>();
        builder.Services.AddSingleton<PrerenderInvocationCounter>();
        if (enableDistributedCache)
        {
            builder.Services.AddDistributedMemoryCache();
            builder.Services.AddDotReactDistributedCaching();
        }
        builder.Services.AddSingleton(renderer ?? new StubRenderer());
        var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapDotReactPages();
        app.MapDotReactActions();
        app.MapDotReactHealthChecks();
        await app.StartAsync();
        return app;
    }

    private static async Task<(string Token, string Cookie)> GetActionSecurityAsync(HttpClient client)
    {
        var page = await client.GetAsync("/discovered/1");
        var html = await page.Content.ReadAsStringAsync();
        var token = CsrfMetaRegex().Match(html).Groups[1].Value;
        var cookie = page.Headers.GetValues("Set-Cookie").Single(value =>
            value.Contains(".AspNetCore.Antiforgery", StringComparison.Ordinal)).Split(';')[0];
        return (token, cookie);
    }

    private static HttpRequestMessage CreateJsonActionRequest<T>(
        string path,
        T value,
        (string Token, string Cookie) security,
        string? idempotencyKey = null)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, path) { Content = JsonContent.Create(value) };
        request.Headers.Add("X-DotReact-CSRF", security.Token);
        request.Headers.Add("Cookie", security.Cookie);
        if (idempotencyKey is not null) request.Headers.Add("Idempotency-Key", idempotencyKey);
        return request;
    }

    [GeneratedRegex("<meta name=\"dotreact-csrf-token\" content=\"([^\"]+)\">")]
    private static partial Regex CsrfMetaRegex();

    [DotReactPage("/discovered/{id:int}", "pages/discovered")]
    public sealed class DynamicPage : IDotReactPage<PageProps>
    {
        public ValueTask<PageProps> LoadAsync(DotReactPageContext context, CancellationToken cancellationToken) =>
            ValueTask.FromResult(new PageProps(context.GetRouteValue<int>("id")));
    }

    [Authorize(Policy = "pages.read")]
    [DotReactPage("/pages/protected", "pages/protected")]
    public sealed class AuthorizedPage : IDotReactPage<PageProps>
    {
        public ValueTask<PageProps> LoadAsync(
            DotReactPageContext context,
            CancellationToken cancellationToken) => ValueTask.FromResult(new PageProps(1));
    }

    [DotReactCache(60)]
    [DotReactPage("/cache/items", "cache/items/page")]
    public sealed class CachedPage(CacheInvocationCounter counter) : IDotReactPage<PageProps>
    {
        public ValueTask<PageProps> LoadAsync(
            DotReactPageContext context,
            CancellationToken cancellationToken) =>
            ValueTask.FromResult(new PageProps(counter.Increment()));
    }

    [DotReactPrerender(60)]
    [DotReactPage("/prerender/stable", "prerender/stable/page")]
    public sealed class PrerenderedPage(PrerenderInvocationCounter counter) : IDotReactPage<PageProps>
    {
        public ValueTask<PageProps> LoadAsync(
            DotReactPageContext context,
            CancellationToken cancellationToken) =>
            ValueTask.FromResult(new PageProps(counter.Increment()));
    }

    [DotReactPrerender]
    [DotReactPage("/prerender/{id:int}", "prerender/dynamic/page")]
    public sealed class DynamicPrerenderedPage : IDotReactPage<PageProps>
    {
        public ValueTask<PageProps> LoadAsync(
            DotReactPageContext context,
            CancellationToken cancellationToken) =>
            ValueTask.FromResult(new PageProps(context.GetRouteValue<int>("id")));
    }

    public sealed class DynamicPrerenderedPaths : IDotReactStaticPathProvider<DynamicPrerenderedPage>
    {
        public async IAsyncEnumerable<DotReactStaticPath> GetPathsAsync(
            [EnumeratorCancellation] CancellationToken cancellationToken)
        {
            await Task.Yield();
            foreach (var id in new[] { "10", "11" })
            {
                cancellationToken.ThrowIfCancellationRequested();
                yield return new DotReactStaticPath(
                    new Dictionary<string, string> { ["id"] = id }, ["catalog"]);
            }
        }
    }

    [DotReactPage("/result/status", "result/status/page")]
    public sealed class StatusPage : IDotReactResultPage<PageProps>
    {
        public ValueTask<DotReactPageResult<PageProps>> LoadAsync(
            DotReactPageContext context,
            CancellationToken cancellationToken) =>
            ValueTask.FromResult(DotReactPageResult<PageProps>.Page(
                new PageProps(StatusCodes.Status422UnprocessableEntity),
                StatusCodes.Status422UnprocessableEntity));
    }

    [DotReactPage("/result/missing", "result/missing/page")]
    public sealed class MissingPage : IDotReactResultPage<PageProps>
    {
        public ValueTask<DotReactPageResult<PageProps>> LoadAsync(
            DotReactPageContext context,
            CancellationToken cancellationToken) =>
            ValueTask.FromResult(DotReactPageResult<PageProps>.NotFound());
    }

    [DotReactPage("/result/redirect", "result/redirect/page")]
    public sealed class RedirectPage : IDotReactResultPage<PageProps>
    {
        public ValueTask<DotReactPageResult<PageProps>> LoadAsync(
            DotReactPageContext context,
            CancellationToken cancellationToken) =>
            ValueTask.FromResult(DotReactPageResult<PageProps>.Redirect("/discovered/7?from=result"));
    }

    [DotReactPage("/result/redirect-permanent", "result/redirect-permanent/page")]
    public sealed class PermanentRedirectPage : IDotReactResultPage<PageProps>
    {
        public ValueTask<DotReactPageResult<PageProps>> LoadAsync(
            DotReactPageContext context,
            CancellationToken cancellationToken) =>
            ValueTask.FromResult(DotReactPageResult<PageProps>.Redirect(
                "/discovered/7?from=result", permanent: true));
    }

    [AllowAnonymous]
    [DotReactAction("test/outcome")]
    public sealed class OutcomeAction : IDotReactAction<ActionRequest, ActionResponse>
    {
        public ValueTask<DotReactActionResult<ActionResponse>> ExecuteAsync(ActionRequest request, CancellationToken cancellationToken) =>
            ValueTask.FromResult(request.Mode switch
            {
                "success" => DotReactActionResult<ActionResponse>.Success(new(true)),
                "validation" => DotReactActionResult<ActionResponse>.Validation(
                    new Dictionary<string, string[]> { ["mode"] = ["Invalid mode."] }),
                "missing" => DotReactActionResult<ActionResponse>.NotFound("Missing."),
                _ => DotReactActionResult<ActionResponse>.Conflict("Conflict.")
            });
    }

    [DotReactAction("test/protected")]
    public sealed class ProtectedAction : IDotReactAction<ActionRequest, ActionResponse>
    {
        public ValueTask<DotReactActionResult<ActionResponse>> ExecuteAsync(ActionRequest request, CancellationToken cancellationToken) =>
            ValueTask.FromResult(DotReactActionResult<ActionResponse>.Success(new(true)));
    }

    [DotReactAction("test/resource")]
    [DotReactAuthorizeResource("resource.allowed")]
    public sealed class ResourceAction(ResourceInvocationCounter counter)
        : IDotReactAction<ResourceRequest, ActionResponse>,
          IDotReactActionResourceProvider<ResourceRequest>
    {
        public ValueTask<object?> LoadAuthorizationResourceAsync(
            ResourceRequest request,
            CancellationToken cancellationToken) => ValueTask.FromResult<object?>(new ResourceRecord(request.Id));

        public ValueTask<DotReactActionResult<ActionResponse>> ExecuteAsync(
            ResourceRequest request,
            CancellationToken cancellationToken)
        {
            counter.Increment();
            return ValueTask.FromResult(DotReactActionResult<ActionResponse>.Success(new(true)));
        }
    }

    [AllowAnonymous]
    [DotReactAction("test/invalidate-cache")]
    public sealed class InvalidateCacheAction : IDotReactAction<ActionRequest, ActionResponse>
    {
        public ValueTask<DotReactActionResult<ActionResponse>> ExecuteAsync(
            ActionRequest request,
            CancellationToken cancellationToken) =>
            ValueTask.FromResult(DotReactActionResult<ActionResponse>.Success(
                new(true), ["/cache/items"]));
    }

    [AllowAnonymous]
    [DotReactAction("test/idempotent")]
    [DotReactIdempotent]
    public sealed class IdempotentAction(InvocationCounter counter) : IDotReactAction<ActionRequest, IdempotentResponse>
    {
        public async ValueTask<DotReactActionResult<IdempotentResponse>> ExecuteAsync(
            ActionRequest request,
            CancellationToken cancellationToken)
        {
            var invocation = counter.Increment();
            await Task.Delay(30, cancellationToken);
            return DotReactActionResult<IdempotentResponse>.Success(
                new IdempotentResponse(invocation, request.Mode), ["/discovered/1"]);
        }
    }

    public sealed record PageProps(int Id);
    public sealed record ActionRequest(string Mode);
    public sealed record ActionResponse(bool Ok);
    public sealed record IdempotentResponse(int Invocation, string Mode);
    public sealed record ResourceRequest(int Id);
    public sealed record ResourceRecord(int Id);

    public sealed class InvocationCounter
    {
        private int _count;
        public int Count => _count;
        public int Increment() => Interlocked.Increment(ref _count);
    }

    public sealed class ResourceInvocationCounter
    {
        private int _count;
        public int Count => _count;
        public int Increment() => Interlocked.Increment(ref _count);
    }

    public sealed class CacheInvocationCounter
    {
        private int _count;
        public int Count => _count;
        public int Increment() => Interlocked.Increment(ref _count);
    }

    public sealed class PrerenderInvocationCounter
    {
        private int _count;
        public int Count => _count;
        public int Increment() => Interlocked.Increment(ref _count);
    }

    private sealed class TestAuthenticationHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        public const string AuthenticationSchemeName = "DotReact.Tests";

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            var identity = new ClaimsIdentity([
                new Claim(ClaimTypes.NameIdentifier, "test-user")
            ], AuthenticationSchemeName);
            return Task.FromResult(AuthenticateResult.Success(
                new AuthenticationTicket(new ClaimsPrincipal(identity), AuthenticationSchemeName)));
        }
    }

    private sealed class StubRenderer : IDotReactRenderer
    {
        public Task<DotReactRenderResponse> RenderAsync(DotReactRenderRequest request, CancellationToken cancellationToken) =>
            Task.FromResult(new DotReactRenderResponse
            {
                ProtocolVersion = 1,
                RequestId = request.RequestId,
                Ok = true,
                Html = "<main></main>"
            });
    }

    private sealed class CountingRenderer : IDotReactRenderer
    {
        public int CallCount { get; private set; }
        public DotReactRenderRequest? LastRequest { get; private set; }

        public Task<DotReactRenderResponse> RenderAsync(
            DotReactRenderRequest request,
            CancellationToken cancellationToken)
        {
            CallCount++;
            LastRequest = request;
            return Task.FromResult(new DotReactRenderResponse
            {
                ProtocolVersion = 1,
                RequestId = request.RequestId,
                Ok = true,
                Html = "<main></main>"
            });
        }
    }
}
