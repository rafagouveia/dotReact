using System.Diagnostics;
using System.Net;
using System.Reflection;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using DotReact.AspNetCore;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Microsoft.AspNetCore.Routing;

/// <summary>Endpoint routing extensions for DotReact pages.</summary>
public static class DotReactEndpointRouteBuilderExtensions
{
    private static readonly MethodInfo MapDiscoveredPageMethod = typeof(DotReactEndpointRouteBuilderExtensions)
        .GetMethod(nameof(MapDiscoveredPage), BindingFlags.NonPublic | BindingFlags.Static)!;
    private static readonly MethodInfo MapDiscoveredResultPageMethod = typeof(DotReactEndpointRouteBuilderExtensions)
        .GetMethod(nameof(MapDiscoveredResultPage), BindingFlags.NonPublic | BindingFlags.Static)!;
    private static readonly MethodInfo MapDiscoveredActionMethod = typeof(DotReactEndpointRouteBuilderExtensions)
        .GetMethod(nameof(MapDiscoveredAction), BindingFlags.NonPublic | BindingFlags.Static)!;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        NumberHandling = JsonNumberHandling.AllowReadingFromString,
        Converters = { new JsonStringEnumConverter() }
    };

    /// <summary>Maps a route whose props are loaded in .NET and rendered by a React module.</summary>
    public static IEndpointConventionBuilder MapDotReactPage<TProps>(
        this IEndpointRouteBuilder endpoints,
        string pattern,
        string moduleId,
        Func<HttpContext, CancellationToken, ValueTask<TProps>> loader)
    {
        ArgumentNullException.ThrowIfNull(endpoints);
        ArgumentException.ThrowIfNullOrWhiteSpace(pattern);
        ArgumentException.ThrowIfNullOrWhiteSpace(moduleId);
        ArgumentNullException.ThrowIfNull(loader);

        return endpoints.MapGet(pattern, context => HandleAsync(context, moduleId, loader));
    }

    /// <summary>Maps a route using a synchronous props loader.</summary>
    public static IEndpointConventionBuilder MapDotReactPage<TProps>(
        this IEndpointRouteBuilder endpoints,
        string pattern,
        string moduleId,
        Func<HttpContext, TProps> loader) =>
        endpoints.MapDotReactPage(pattern, moduleId,
            (context, _) => ValueTask.FromResult(loader(context)));

    /// <summary>Maps all page types registered through AddDotReactPages.</summary>
    public static IEndpointRouteBuilder MapDotReactPages(this IEndpointRouteBuilder endpoints)
    {
        ArgumentNullException.ThrowIfNull(endpoints);
        var registry = endpoints.ServiceProvider.GetRequiredService<DotReactPageRegistry>();
        foreach (var page in registry.Items)
        {
            var mapper = page.ReturnsResult ? MapDiscoveredResultPageMethod : MapDiscoveredPageMethod;
            mapper.MakeGenericMethod(page.ImplementationType, page.PropsType)
                .Invoke(null, [endpoints, page.Pattern, page.ModuleId, page.Prerender]);
        }
        var manifest = endpoints.MapGet("/_dotreact/prerender-manifest", HandlePrerenderManifestAsync);
        ApplyRateLimitIfRegistered(endpoints, manifest);
        return endpoints;
    }

    /// <summary>Maps all registered actions under the reserved DotReact action route.</summary>
    public static IEndpointRouteBuilder MapDotReactActions(this IEndpointRouteBuilder endpoints)
    {
        ArgumentNullException.ThrowIfNull(endpoints);
        var registry = endpoints.ServiceProvider.GetRequiredService<DotReactActionRegistry>();
        foreach (var action in registry.Items)
        {
            MapDiscoveredActionMethod.MakeGenericMethod(
                    action.ImplementationType, action.RequestType, action.ResponseType)
                .Invoke(null, [endpoints, action.Id]);
        }

        var csrf = endpoints.MapGet("/_dotreact/csrf", static (HttpContext context, IAntiforgery antiforgery) =>
        {
            context.Response.Headers.CacheControl = "private,no-store";
            var token = antiforgery.GetAndStoreTokens(context).RequestToken
                ?? throw new InvalidOperationException("The antiforgery service did not issue a request token.");
            return Results.Json(new { token });
        });
        ApplyRateLimitIfRegistered(endpoints, csrf);

        // Explicit fallbacks avoid method-disclosure (405) and make unknown IDs uniformly 404.
        var fallback = endpoints.MapMethods("/_dotreact/actions/{*actionId}", [HttpMethods.Get, HttpMethods.Post],
            static () => Results.NotFound());
        ApplyRateLimitIfRegistered(endpoints, fallback);
        return endpoints;
    }

    /// <summary>Maps an explicit final fallback that renders the nearest root not-found boundary.</summary>
    public static IEndpointConventionBuilder MapDotReactFallback(
        this IEndpointRouteBuilder endpoints,
        string rootModuleId = "page")
    {
        ArgumentNullException.ThrowIfNull(endpoints);
        ArgumentException.ThrowIfNullOrWhiteSpace(rootModuleId);
        return endpoints.MapFallback(context => HandleFallbackAsync(context, rootModuleId));
    }

    private static void MapDiscoveredPage<TPage, TProps>(
        IEndpointRouteBuilder endpoints,
        string pattern,
        string moduleId,
        DotReactPrerenderMetadata? prerender)
        where TPage : class, IDotReactPage<TProps>
    {
        var cachePolicy = typeof(TPage).GetCustomAttribute<DotReactCacheAttribute>(inherit: true);
        var builder = endpoints.MapGet(pattern, context => HandleResultAsync(context, moduleId,
            async (httpContext, cancellationToken) =>
            {
                async ValueTask<DotReactPageResult<TProps>> LoadAsync(CancellationToken token)
                {
                    var page = httpContext.RequestServices.GetRequiredService<TPage>();
                    var props = await page.LoadAsync(new DotReactPageContext(httpContext), token)
                        .ConfigureAwait(false);
                    return DotReactPageResult<TProps>.Page(props);
                }

                if (cachePolicy is null) return await LoadAsync(cancellationToken).ConfigureAwait(false);
                return await httpContext.RequestServices.GetRequiredService<IDotReactPageCache>()
                    .GetOrCreateAsync(httpContext.Request.GetEncodedPathAndQuery(),
                        TimeSpan.FromSeconds(cachePolicy.DurationSeconds), LoadAsync, cancellationToken)
                    .ConfigureAwait(false);
            }, prerender));
        builder.WithName(PageEndpointName(moduleId));
        ApplyPageAuthorization<TPage>(builder);
    }

    private static void MapDiscoveredResultPage<TPage, TProps>(
        IEndpointRouteBuilder endpoints,
        string pattern,
        string moduleId,
        DotReactPrerenderMetadata? prerender)
        where TPage : class, IDotReactResultPage<TProps>
    {
        var cachePolicy = typeof(TPage).GetCustomAttribute<DotReactCacheAttribute>(inherit: true);
        var builder = endpoints.MapGet(pattern, context => HandleResultAsync(context, moduleId,
            async (httpContext, cancellationToken) =>
            {
                async ValueTask<DotReactPageResult<TProps>> LoadAsync(CancellationToken token)
                {
                    var page = httpContext.RequestServices.GetRequiredService<TPage>();
                    return await page.LoadAsync(new DotReactPageContext(httpContext), token)
                        .ConfigureAwait(false);
                }

                if (cachePolicy is null) return await LoadAsync(cancellationToken).ConfigureAwait(false);
                return await httpContext.RequestServices.GetRequiredService<IDotReactPageCache>()
                    .GetOrCreateAsync(httpContext.Request.GetEncodedPathAndQuery(),
                        TimeSpan.FromSeconds(cachePolicy.DurationSeconds), LoadAsync, cancellationToken)
                    .ConfigureAwait(false);
            }, prerender));
        builder.WithName(PageEndpointName(moduleId));
        ApplyPageAuthorization<TPage>(builder);
    }

    private static string PageEndpointName(string moduleId) => $"DotReact.Page:{moduleId}";

    private static async Task<IResult> HandlePrerenderManifestAsync(
        HttpContext context,
        CancellationToken cancellationToken)
    {
        context.Response.Headers.CacheControl = "public,max-age=0,must-revalidate";
        var registry = context.RequestServices.GetRequiredService<DotReactPageRegistry>();
        var sources = context.RequestServices.GetServices<IDotReactStaticPathSource>()
            .ToDictionary(source => source.PageType);
        var links = context.RequestServices.GetRequiredService<LinkGenerator>();
        var options = context.RequestServices.GetRequiredService<IOptions<DotReactOptions>>().Value;
        var entries = new List<PrerenderManifestEntry>();
        var seen = new HashSet<string>(StringComparer.Ordinal);

        foreach (var page in registry.Items.Where(page => page.Prerender is not null)
                     .OrderBy(page => page.Pattern, StringComparer.Ordinal))
        {
            var metadata = page.Prerender!;
            if (!sources.TryGetValue(page.ImplementationType, out var source))
            {
                var path = links.GetPathByName(context, PageEndpointName(page.ModuleId), values: null);
                if (path is null)
                    throw new InvalidOperationException(
                        $"Dynamic prerender page '{page.ImplementationType.FullName}' requires an " +
                        $"IDotReactStaticPathProvider<{page.ImplementationType.Name}>.");
                AddManifestEntry(entries, seen, page, path, metadata.Tags);
                continue;
            }

            await foreach (var staticPath in source.GetPathsAsync(cancellationToken)
                               .WithCancellation(cancellationToken).ConfigureAwait(false))
            {
                if (entries.Count >= options.MaxStaticPaths)
                    throw new InvalidOperationException(
                        $"Prerender manifest exceeded the configured {options.MaxStaticPaths} path limit.");
                var routeValues = new RouteValueDictionary();
                foreach (var (name, value) in staticPath.RouteValues)
                    routeValues[name] = value;
                var path = links.GetPathByName(
                    context,
                    PageEndpointName(page.ModuleId),
                    routeValues)
                    ?? throw new InvalidOperationException(
                        $"Static path provider for '{page.ImplementationType.FullName}' returned incomplete route values.");
                AddManifestEntry(entries, seen, page, path,
                    metadata.Tags.Concat(staticPath.Tags).Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal));
            }
        }

        return Results.Json(new PrerenderManifest(
            1,
            options.PrerenderBuildId,
            entries.OrderBy(entry => entry.Path, StringComparer.Ordinal).ToArray()));
    }

    private static void AddManifestEntry(
        ICollection<PrerenderManifestEntry> entries,
        ISet<string> seen,
        DotReactPageDescriptor page,
        string path,
        IEnumerable<string> tags)
    {
        var canonicalPath = new DotReactPrerenderKey("manifest", path).Path;
        if (!seen.Add(canonicalPath))
            throw new InvalidOperationException($"Prerender providers produced duplicate path '{canonicalPath}'.");
        entries.Add(new PrerenderManifestEntry(
            canonicalPath,
            page.ModuleId,
            page.Prerender!.FreshFor is null ? null : (int)page.Prerender.FreshFor.Value.TotalSeconds,
            tags.ToArray()));
    }

    private static void MapDiscoveredAction<TAction, TRequest, TResponse>(
        IEndpointRouteBuilder endpoints, string id)
        where TAction : class, IDotReactAction<TRequest, TResponse>
    {
        var builder = endpoints.MapPost("/_dotreact/actions/" + id,
            (HttpContext context, CancellationToken cancellationToken) =>
                HandleActionAsync<TAction, TRequest, TResponse>(context, id, cancellationToken));
        builder.AddEndpointFilter(new DotReactActionTelemetryFilter(id));
        ApplyRateLimitIfRegistered(endpoints, builder);

        var attributes = typeof(TAction).GetCustomAttributes(inherit: true).ToArray();
        var allowAnonymous = attributes.OfType<IAllowAnonymous>().ToArray();
        if (allowAnonymous.Length > 0)
        {
            builder.WithMetadata(allowAnonymous);
        }
        else
        {
            var authorization = attributes.OfType<IAuthorizeData>().ToArray();
            builder.RequireAuthorization(authorization.Length == 0 ? [new AuthorizeAttribute()] : authorization);
        }
    }

    private static void ApplyPageAuthorization<TPage>(IEndpointConventionBuilder builder)
    {
        var attributes = typeof(TPage).GetCustomAttributes(inherit: true).ToArray();
        var allowAnonymous = attributes.OfType<IAllowAnonymous>().ToArray();
        if (allowAnonymous.Length > 0)
        {
            builder.WithMetadata(allowAnonymous);
            return;
        }

        var authorization = attributes.OfType<IAuthorizeData>().ToArray();
        if (authorization.Length > 0)
            builder.RequireAuthorization(authorization);
    }

    private static void ApplyRateLimitIfRegistered(
        IEndpointRouteBuilder endpoints,
        IEndpointConventionBuilder endpoint)
    {
        if (endpoints.ServiceProvider.GetService<DotReactRateLimitingRegistration>() is not null)
            endpoint.RequireRateLimiting(DotReactRateLimiting.PolicyName);
    }

    private static async Task<IResult> HandleActionAsync<TAction, TRequest, TResponse>(
        HttpContext context, string actionId, CancellationToken cancellationToken)
        where TAction : class, IDotReactAction<TRequest, TResponse>
    {
        context.Response.Headers.CacheControl = "private,no-store";
        var actionOptions = context.RequestServices.GetRequiredService<IOptions<DotReactActionOptions>>().Value;
        byte[] requestBody;
        try
        {
            requestBody = await ReadBoundedBodyAsync(
                context.Request, actionOptions.MaxRequestBodyBytes, cancellationToken).ConfigureAwait(false);
        }
        catch (BadHttpRequestException)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status413PayloadTooLarge,
                title: "Action payload too large",
                detail: $"DotReact action payloads are limited to {actionOptions.MaxRequestBodyBytes} bytes.");
        }

        try
        {
            await context.RequestServices.GetRequiredService<IAntiforgery>()
                .ValidateRequestAsync(context).ConfigureAwait(false);
        }
        catch (AntiforgeryValidationException)
        {
            return Results.Problem(
                statusCode: StatusCodes.Status400BadRequest,
                title: "Invalid antiforgery token",
                detail: "A valid DotReact CSRF token is required.");
        }

        TRequest request;
        IFormCollection? form = null;
        try
        {
            if (context.Request.HasFormContentType)
            {
                form = await context.Request.ReadFormAsync(cancellationToken).ConfigureAwait(false);
                if (form.Files.Count > 0)
                    return Results.Problem(statusCode: StatusCodes.Status415UnsupportedMediaType,
                        title: "File uploads require an explicit upload endpoint");
                request = BindForm<TRequest>(form);
            }
            else
            {
                request = await context.Request.ReadFromJsonAsync<TRequest>(JsonOptions, cancellationToken)
                    .ConfigureAwait(false)
                    ?? throw new JsonException("Action request body is required.");
            }
        }
        catch (Exception exception) when (exception is JsonException or FormatException or InvalidOperationException)
        {
            return Results.Problem(statusCode: StatusCodes.Status400BadRequest,
                title: "Invalid action request", detail: "The action payload could not be bound to its generated contract.");
        }

        var action = context.RequestServices.GetRequiredService<TAction>();
        var resourcePolicy = typeof(TAction).GetCustomAttribute<DotReactAuthorizeResourceAttribute>(inherit: true);
        if (resourcePolicy is not null)
        {
            var provider = (IDotReactActionResourceProvider<TRequest>)action;
            var resource = await provider.LoadAuthorizationResourceAsync(request, cancellationToken)
                .ConfigureAwait(false);
            if (resource is null)
                return Results.NotFound();
            var authorization = await context.RequestServices.GetRequiredService<IAuthorizationService>()
                .AuthorizeAsync(context.User, resource, resourcePolicy.Policy).ConfigureAwait(false);
            if (!authorization.Succeeded)
                return Results.Forbid();
        }

        var idempotent = typeof(TAction).GetCustomAttribute<DotReactIdempotentAttribute>(inherit: false);
        if (idempotent is not null)
        {
            if (form is not null)
                return Results.Problem(statusCode: StatusCodes.Status415UnsupportedMediaType,
                    title: "Idempotent actions require JSON",
                    detail: "Progressive form actions cannot provide replay-safe idempotency semantics.");
            var keyValues = context.Request.Headers["Idempotency-Key"];
            var key = keyValues.Count == 1 ? keyValues[0] ?? string.Empty : string.Empty;
            if (!IsSafeIdempotencyKey(key, actionOptions.MaxIdempotencyKeyLength))
                return Results.Problem(statusCode: StatusCodes.Status400BadRequest,
                    title: "Invalid idempotency key",
                    detail: $"Idempotent actions require a 1-{actionOptions.MaxIdempotencyKeyLength} character Idempotency-Key header.");

            var store = context.RequestServices.GetRequiredService<IDotReactActionIdempotencyStore>();
            var fingerprint = Convert.ToHexString(SHA256.HashData(requestBody));
            var retention = idempotent.RetentionSeconds == 0
                ? actionOptions.IdempotencyRetention
                : TimeSpan.FromSeconds(idempotent.RetentionSeconds);
            DotReactIdempotencyOutcome outcome;
            try
            {
                outcome = await store.ExecuteAsync(
                    CreateIdempotencyScope(context, actionId),
                    key,
                    fingerprint,
                    retention,
                    async operationCancellation =>
                    {
                        var executed = await action.ExecuteAsync(request, operationCancellation).ConfigureAwait(false);
                        await InvalidateCacheAsync(context, executed, operationCancellation).ConfigureAwait(false);
                        return CreateStoredActionResponse(executed);
                    },
                    cancellationToken).ConfigureAwait(false);
            }
            catch (DotReactIdempotencyCapacityException)
            {
                return Results.Problem(statusCode: StatusCodes.Status503ServiceUnavailable,
                    title: "Idempotency store unavailable",
                    detail: "The bounded replay store cannot accept another request right now.");
            }

            if (outcome.FingerprintConflict)
                return Results.Problem(statusCode: StatusCodes.Status409Conflict,
                    title: "Idempotency key conflict",
                    detail: "The idempotency key was already used with a different action payload.");
            return new StoredActionResult(outcome.Response!, outcome.Replayed);
        }

        var result = await action.ExecuteAsync(request, cancellationToken).ConfigureAwait(false);
        await InvalidateCacheAsync(context, result, cancellationToken).ConfigureAwait(false);
        if (form is not null && result.Kind == DotReactActionResultKind.Success
            && form.TryGetValue("_dotreact_return", out var returnValues))
        {
            var returnPath = returnValues.ToString();
            if (IsLocalPath(returnPath)) return Results.LocalRedirect(returnPath);
        }
        if (result.Kind == DotReactActionResultKind.Success)
            AppendRevalidationHeader(context.Response, result.RevalidatePaths);
        return result.Kind switch
        {
            DotReactActionResultKind.Success => Results.Ok(result.Value),
            DotReactActionResultKind.Validation => Results.ValidationProblem(
                result.Errors ?? new Dictionary<string, string[]>(), detail: result.Detail),
            DotReactActionResultKind.NotFound => Results.Problem(
                statusCode: StatusCodes.Status404NotFound, title: "Not found", detail: result.Detail),
            DotReactActionResultKind.Conflict => Results.Problem(
                statusCode: StatusCodes.Status409Conflict, title: "Conflict", detail: result.Detail),
            _ => throw new InvalidOperationException("Unsupported DotReact action result.")
        };
    }

    private static async ValueTask InvalidateCacheAsync<TResponse>(
        HttpContext context,
        DotReactActionResult<TResponse> result,
        CancellationToken cancellationToken)
    {
        if (result.Kind != DotReactActionResultKind.Success || result.RevalidatePaths.Count == 0)
            return;
        var invalidator = context.RequestServices.GetService<IDotReactCacheInvalidator>();
        if (invalidator is not null)
        {
            try
            {
                await invalidator.InvalidateAsync(result.RevalidatePaths, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception exception) when (exception is not OperationCanceledException)
            {
                context.RequestServices.GetRequiredService<ILoggerFactory>()
                    .CreateLogger("DotReact.Cache")
                    .LogError(exception, "Distributed cache invalidation failed for action paths.");
            }
        }

        var prerenderStore = context.RequestServices.GetService<IDotReactPrerenderStore>();
        if (prerenderStore is null) return;
        try
        {
            var buildId = context.RequestServices.GetRequiredService<IOptions<DotReactOptions>>()
                .Value.PrerenderBuildId;
            foreach (var pathAndQuery in result.RevalidatePaths)
            {
                var separator = pathAndQuery.IndexOfAny(['?', '#']);
                var path = separator < 0 ? pathAndQuery : pathAndQuery[..separator];
                await prerenderStore.InvalidatePathAsync(
                    new DotReactPrerenderKey(buildId, path), cancellationToken).ConfigureAwait(false);
            }
        }
        catch (Exception exception) when (exception is not OperationCanceledException)
        {
            context.RequestServices.GetRequiredService<ILoggerFactory>()
                .CreateLogger("DotReact.Prerender")
                .LogError(exception, "Prerender invalidation failed for action paths.");
        }
    }

    private static async Task<byte[]> ReadBoundedBodyAsync(
        HttpRequest request,
        int maxBytes,
        CancellationToken cancellationToken)
    {
        if (request.ContentLength > maxBytes)
            throw new BadHttpRequestException("The action request body is too large.", StatusCodes.Status413PayloadTooLarge);

        request.EnableBuffering(bufferThreshold: Math.Min(30 * 1024, maxBytes), bufferLimit: maxBytes + 1L);
        await using var buffer = new MemoryStream(Math.Min(maxBytes, 16 * 1024));
        var chunk = new byte[8 * 1024];
        try
        {
            while (true)
            {
                var read = await request.Body.ReadAsync(chunk, cancellationToken).ConfigureAwait(false);
                if (read == 0) break;
                if (buffer.Length + read > maxBytes)
                    throw new BadHttpRequestException("The action request body is too large.", StatusCodes.Status413PayloadTooLarge);
                await buffer.WriteAsync(chunk.AsMemory(0, read), cancellationToken).ConfigureAwait(false);
            }
            return buffer.ToArray();
        }
        catch (IOException exception)
        {
            throw new BadHttpRequestException(
                "The action request body is too large.", StatusCodes.Status413PayloadTooLarge, exception);
        }
        finally
        {
            if (request.Body.CanSeek) request.Body.Position = 0;
        }
    }

    private static bool IsSafeIdempotencyKey(string key, int maxLength) =>
        key.Length is > 0 && key.Length <= maxLength
        && key.All(character => character is >= '!' and <= '~'
            && character is not '\\' and not '/' and not ',');

    private static string CreateIdempotencyScope(HttpContext context, string actionId)
    {
        var identity = context.User.Identity?.IsAuthenticated == true
            ? string.Join('|',
                context.User.Identities.Select(item =>
                    $"{item.AuthenticationType}:{item.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? item.FindFirst("sub")?.Value ?? item.Name}"))
            : "csrf:" + context.Request.Headers["X-DotReact-CSRF"].ToString();
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(actionId + "\n" + identity)));
    }

    private static DotReactStoredActionResponse CreateStoredActionResponse<TResponse>(
        DotReactActionResult<TResponse> result)
    {
        object? body;
        int status;
        string contentType;
        switch (result.Kind)
        {
            case DotReactActionResultKind.Success:
                body = result.Value;
                status = StatusCodes.Status200OK;
                contentType = "application/json; charset=utf-8";
                break;
            case DotReactActionResultKind.Validation:
                body = new HttpValidationProblemDetails(
                    result.Errors?.ToDictionary(pair => pair.Key, pair => pair.Value)
                    ?? new Dictionary<string, string[]>())
                {
                    Status = StatusCodes.Status400BadRequest,
                    Title = "One or more validation errors occurred.",
                    Detail = result.Detail
                };
                status = StatusCodes.Status400BadRequest;
                contentType = "application/problem+json; charset=utf-8";
                break;
            case DotReactActionResultKind.NotFound:
                body = new ProblemDetails { Status = StatusCodes.Status404NotFound, Title = "Not found", Detail = result.Detail };
                status = StatusCodes.Status404NotFound;
                contentType = "application/problem+json; charset=utf-8";
                break;
            case DotReactActionResultKind.Conflict:
                body = new ProblemDetails { Status = StatusCodes.Status409Conflict, Title = "Conflict", Detail = result.Detail };
                status = StatusCodes.Status409Conflict;
                contentType = "application/problem+json; charset=utf-8";
                break;
            default:
                throw new InvalidOperationException("Unsupported DotReact action result.");
        }

        var bytes = JsonSerializer.SerializeToUtf8Bytes(body, body?.GetType() ?? typeof(object), JsonOptions);
        return new DotReactStoredActionResponse(status, contentType, bytes, result.RevalidatePaths);
    }

    private static void AppendRevalidationHeader(HttpResponse response, IReadOnlyList<string> paths)
    {
        if (paths.Count > 0)
            response.Headers["X-DotReact-Revalidate"] = string.Join(',', paths.Select(Uri.EscapeDataString));
    }

    private sealed class StoredActionResult(DotReactStoredActionResponse response, bool replayed) : IResult
    {
        public async Task ExecuteAsync(HttpContext httpContext)
        {
            httpContext.Response.StatusCode = response.StatusCode;
            httpContext.Response.ContentType = response.ContentType;
            httpContext.Response.ContentLength = response.Body.Length;
            httpContext.Response.Headers["Idempotency-Replayed"] = replayed ? "true" : "false";
            AppendRevalidationHeader(httpContext.Response, response.RevalidatePaths);
            await httpContext.Response.Body.WriteAsync(response.Body, httpContext.RequestAborted).ConfigureAwait(false);
        }
    }

    private static TRequest BindForm<TRequest>(IFormCollection form)
    {
        var payload = new JsonObject();
        foreach (var property in typeof(TRequest).GetProperties(BindingFlags.Instance | BindingFlags.Public))
        {
            var key = form.Keys.FirstOrDefault(candidate =>
                string.Equals(candidate, property.Name, StringComparison.OrdinalIgnoreCase));
            if (key is null) continue;
            var values = form[key];
            payload[property.Name] = values.Count <= 1
                ? JsonValue.Create(values.ToString())
                : new JsonArray(values.Select(value => (JsonNode?)JsonValue.Create(value)).ToArray());
        }
        return payload.Deserialize<TRequest>(JsonOptions)
            ?? throw new JsonException("Action form payload is required.");
    }

    private static bool IsLocalPath(string location) =>
        location.Length > 0 && location[0] == '/'
        && !location.StartsWith("//", StringComparison.Ordinal)
        && !location.Contains('\\')
        && !location.Any(char.IsControl);

    private static async Task HandleAsync<TProps>(
        HttpContext context,
        string moduleId,
        Func<HttpContext, CancellationToken, ValueTask<TProps>> loader)
    {
        await HandleResultAsync(context, moduleId, async (httpContext, cancellationToken) =>
            DotReactPageResult<TProps>.Page(
                await loader(httpContext, cancellationToken).ConfigureAwait(false))).ConfigureAwait(false);
    }

    private static async Task HandleResultAsync<TProps>(
        HttpContext context,
        string moduleId,
        Func<HttpContext, CancellationToken, ValueTask<DotReactPageResult<TProps>>> loader,
        DotReactPrerenderMetadata? prerender = null)
    {
        context.Response.Headers.CacheControl = "private,no-store";
        var options = context.RequestServices.GetRequiredService<IOptions<DotReactOptions>>().Value;
        var logger = context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("DotReact");
        var requestId = Activity.Current?.TraceId.ToString() ?? context.TraceIdentifier;

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
        timeout.CancelAfter(options.RequestTimeout);

        try
        {
            if (prerender is not null && !context.Request.QueryString.HasValue &&
                !IsClientNavigation(context.Request) &&
                await TryWriteFreshPrerenderedDocumentAsync(context, options, timeout.Token)
                    .ConfigureAwait(false))
            {
                return;
            }

            var loaderStarted = Stopwatch.GetTimestamp();
            var outcome = await loader(context, timeout.Token).ConfigureAwait(false)
                ?? throw new InvalidOperationException("A DotReact result page returned null.");
            AppendServerTiming(context, options, "loader", Stopwatch.GetElapsedTime(loaderStarted));
            if (outcome.Kind == DotReactPageResultKind.Redirect)
            {
                context.Response.StatusCode = outcome.StatusCode;
                context.Response.Headers.Location = outcome.Location!;
                return;
            }

            if (outcome.Kind == DotReactPageResultKind.NotFound)
            {
                if (IsClientNavigation(context.Request))
                {
                    var boundaryProps = JsonSerializer.SerializeToElement(new
                    {
                        statusCode = StatusCodes.Status404NotFound,
                        requestId,
                        message = "The requested page was not found."
                    }, JsonOptions);
                    var boundaryCsrf = context.RequestServices.GetRequiredService<IAntiforgery>()
                        .GetAndStoreTokens(context).RequestToken;
                    await WriteNavigationPayloadAsync(context, requestId, moduleId, boundaryProps,
                        boundaryCsrf, "not-found", StatusCodes.Status404NotFound).ConfigureAwait(false);
                    return;
                }
                var rendered = await TryRenderBoundaryAsync(
                    context, moduleId, "not-found", requestId, StatusCodes.Status404NotFound,
                    "The requested page was not found.", options, logger, timeout.Token).ConfigureAwait(false);
                if (!rendered)
                    await WriteErrorAsync(context, options, requestId, "The requested page was not found.",
                        StatusCodes.Status404NotFound).ConfigureAwait(false);
                return;
            }

            var props = outcome.Props;
            var propsJson = SerializePageProps(props, moduleId, options, context);
            if (IsClientNavigation(context.Request))
            {
                var navigationCsrfToken = context.RequestServices.GetRequiredService<IAntiforgery>()
                    .GetAndStoreTokens(context).RequestToken
                    ?? throw new InvalidOperationException("The antiforgery service did not issue a request token.");
                await WriteNavigationPayloadAsync(context, requestId, moduleId, propsJson, navigationCsrfToken,
                    null, outcome.StatusCode).ConfigureAwait(false);
                return;
            }
            if (prerender is not null && !context.Request.QueryString.HasValue)
            {
                await WritePrerenderedDocumentAsync(
                    context, moduleId, propsJson, prerender, options, timeout.Token)
                    .ConfigureAwait(false);
                return;
            }
            var csrfToken = context.RequestServices.GetRequiredService<IAntiforgery>()
                .GetAndStoreTokens(context).RequestToken
                ?? throw new InvalidOperationException("The antiforgery service did not issue a request token.");
            if (options.EnableStreaming)
            {
                await WriteStreamingDocumentAsync(
                    context, requestId, moduleId, propsJson, csrfToken, null, outcome.StatusCode,
                    options, logger, timeout.Token).ConfigureAwait(false);
                return;
            }
            var renderer = context.RequestServices.GetRequiredService<IDotReactRenderer>();
            var renderStarted = Stopwatch.GetTimestamp();
            var result = await renderer.RenderAsync(
                new DotReactRenderRequest(
                    1,
                    requestId,
                    moduleId,
                    context.Request.GetEncodedPathAndQuery(),
                    propsJson,
                    "ssr"),
                timeout.Token).ConfigureAwait(false);
            AppendServerTiming(context, options, "render", Stopwatch.GetElapsedTime(renderStarted));

            var hydration = JsonSerializer.Serialize(new HydrationPayload(
                1, requestId, moduleId, propsJson, csrfToken, null), JsonOptions);

            context.Response.StatusCode = outcome.StatusCode;
            context.Response.ContentType = "text/html; charset=utf-8";
            await context.Response.WriteAsync(BuildShell(
                    result, moduleId, hydration, csrfToken, options, DotReactSecurityNonce.Get(context)), context.RequestAborted)
                .ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (!context.RequestAborted.IsCancellationRequested)
        {
            logger.LogWarning("DotReact request {RequestId} timed out after {Timeout}.", requestId, options.RequestTimeout);
            await WriteErrorAsync(context, options, requestId, "The renderer request timed out.",
                StatusCodes.Status504GatewayTimeout).ConfigureAwait(false);
        }
        catch (DotReactRendererUnavailableException exception) when (!context.RequestAborted.IsCancellationRequested)
        {
            logger.LogError(exception, "DotReact renderer was unavailable for request {RequestId}.", requestId);
            await WriteErrorAsync(
                context,
                options,
                requestId,
                "The rendering service is restarting. Please refresh in a moment.",
                StatusCodes.Status503ServiceUnavailable).ConfigureAwait(false);
        }
        catch (Exception exception) when (!context.RequestAborted.IsCancellationRequested)
        {
            logger.LogError(exception, "DotReact request {RequestId} failed.", requestId);
            var rendered = await TryRenderBoundaryAsync(
                context, moduleId, "error", requestId, StatusCodes.Status500InternalServerError,
                options.Development ? exception.Message : "The page could not be rendered.",
                options, logger, context.RequestAborted).ConfigureAwait(false);
            if (!rendered)
                await WriteErrorAsync(context, options, requestId, "The page could not be rendered.",
                        StatusCodes.Status500InternalServerError)
                    .ConfigureAwait(false);
        }
    }

    private static async Task HandleFallbackAsync(HttpContext context, string rootModuleId)
    {
        context.Response.Headers.CacheControl = "private,no-store";
        var options = context.RequestServices.GetRequiredService<IOptions<DotReactOptions>>().Value;
        var logger = context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("DotReact");
        var requestId = Activity.Current?.TraceId.ToString() ?? context.TraceIdentifier;
        if (IsClientNavigation(context.Request))
        {
            var props = JsonSerializer.SerializeToElement(new
            {
                statusCode = StatusCodes.Status404NotFound,
                requestId,
                message = "The requested page was not found."
            }, JsonOptions);
            await WriteNavigationPayloadAsync(context, requestId, rootModuleId, props, null,
                "not-found", StatusCodes.Status404NotFound).ConfigureAwait(false);
            return;
        }
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
        timeout.CancelAfter(options.RequestTimeout);
        var rendered = await TryRenderBoundaryAsync(
            context, rootModuleId, "not-found", requestId, StatusCodes.Status404NotFound,
            "The requested page was not found.", options, logger, timeout.Token).ConfigureAwait(false);
        if (!rendered)
            await WriteErrorAsync(context, options, requestId, "The requested page was not found.",
                StatusCodes.Status404NotFound).ConfigureAwait(false);
    }

    private static async Task<bool> TryRenderBoundaryAsync(
        HttpContext context,
        string sourceModuleId,
        string boundaryKind,
        string requestId,
        int statusCode,
        string message,
        DotReactOptions options,
        ILogger logger,
        CancellationToken cancellationToken)
    {
        if (context.Response.HasStarted) return false;
        try
        {
            var propsJson = JsonSerializer.SerializeToElement(new { statusCode, requestId, message }, JsonOptions);
            var renderer = context.RequestServices.GetRequiredService<IDotReactRenderer>();
            var result = await renderer.RenderAsync(new DotReactRenderRequest(
                1, requestId, sourceModuleId, context.Request.GetEncodedPathAndQuery(), propsJson, "ssr", boundaryKind),
                cancellationToken).ConfigureAwait(false);
            var hydration = JsonSerializer.Serialize(new HydrationPayload(
                1, requestId, sourceModuleId, propsJson, null, boundaryKind), JsonOptions);
            context.Response.Clear();
            context.Response.Headers.CacheControl = "private,no-store";
            context.Response.StatusCode = statusCode;
            context.Response.ContentType = "text/html; charset=utf-8";
            await context.Response.WriteAsync(BuildShell(
                    result, sourceModuleId, hydration, null, options, DotReactSecurityNonce.Get(context)), context.RequestAborted)
                .ConfigureAwait(false);
            return true;
        }
        catch (Exception exception) when (exception is not OperationCanceledException || !context.RequestAborted.IsCancellationRequested)
        {
            logger.LogWarning(exception, "DotReact {BoundaryKind} boundary failed for request {RequestId}; using static fallback.",
                boundaryKind, requestId);
            return false;
        }
    }

    private static string BuildShell(
        DotReactRenderResponse render,
        string moduleId,
        string hydrationJson,
        string? csrfToken,
        DotReactOptions options,
        string? nonce)
    {
        var rootId = HtmlEncoder.Default.Encode(options.RootElementId);
        var scriptSrc = HtmlEncoder.Default.Encode(options.ClientScriptSrc);
        var builder = new StringBuilder(512 + render.Html.Length + hydrationJson.Length);
        builder.Append("<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">");
        AppendBrowserVitalsMeta(builder, options);
        if (csrfToken is not null)
            builder.Append("<meta name=\"dotreact-csrf-token\" content=\"")
                .Append(HtmlEncoder.Default.Encode(csrfToken)).Append("\">");
        AppendHead(builder, render.Head);
        AppendClientModulePreloads(builder, options, moduleId);
        AppendClientStyles(builder, options, moduleId);
        builder.Append("</head><body><div id=\"").Append(rootId).Append("\">");
        builder.Append(render.Html);
        builder.Append("</div><script id=\"__DOTREACT_DATA__\" type=\"application/json\">");
        builder.Append(hydrationJson);
        builder.Append("</script>");
        AppendReactRefreshPreamble(builder, options, nonce);
        builder.Append("<script type=\"module\"");
        AppendNonceAttribute(builder, nonce);
        builder.Append(" src=\"").Append(scriptSrc).Append("\"></script></body></html>");
        return builder.ToString();
    }

    private static async Task WriteStreamingDocumentAsync(
        HttpContext context,
        string requestId,
        string moduleId,
        JsonElement props,
        string? csrfToken,
        string? boundaryKind,
        int statusCode,
        DotReactOptions options,
        ILogger logger,
        CancellationToken cancellationToken)
    {
        var nonce = DotReactSecurityNonce.Get(context);
        var renderer = context.RequestServices.GetRequiredService<IDotReactStreamingRenderer>();
        var request = new DotReactRenderStreamRequest(
            DotReactStreamingProtocol.Version,
            requestId,
            moduleId,
            context.Request.GetEncodedPathAndQuery(),
            props,
            "stream",
            "document",
            ["html-stream"],
            boundaryKind,
            nonce);
        var hydration = JsonSerializer.Serialize(new HydrationPayload(
            1, requestId, moduleId, props, csrfToken, boundaryKind), JsonOptions);
        var started = false;
        await foreach (var frame in renderer.RenderStreamAsync(request, cancellationToken).ConfigureAwait(false))
        {
            switch (frame)
            {
                case DotReactRenderStreamStartFrame start:
                    {
                        started = true;
                        context.Response.StatusCode = statusCode;
                        context.Response.ContentType = "text/html; charset=utf-8";
                        var head = new StringBuilder(512);
                        head.Append("<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">");
                        AppendBrowserVitalsMeta(head, options);
                        if (csrfToken is not null)
                            head.Append("<meta name=\"dotreact-csrf-token\" content=\"")
                                .Append(HtmlEncoder.Default.Encode(csrfToken)).Append("\">");
                        AppendHead(head, start.Head);
                        AppendClientModulePreloads(head, options, moduleId);
                        AppendClientStyles(head, options, moduleId);
                        head.Append("</head><body><div id=\"")
                            .Append(HtmlEncoder.Default.Encode(options.RootElementId)).Append("\">");
                        await context.Response.WriteAsync(head.ToString(), context.RequestAborted).ConfigureAwait(false);
                        await context.Response.Body.FlushAsync(context.RequestAborted).ConfigureAwait(false);
                        break;
                    }
                case DotReactRenderStreamHtmlFrame html:
                    await context.Response.WriteAsync(html.Chunk, context.RequestAborted).ConfigureAwait(false);
                    await context.Response.Body.FlushAsync(context.RequestAborted).ConfigureAwait(false);
                    break;
                case DotReactRenderStreamFlightFrame:
                    throw new DotReactRendererException(
                        "Renderer emitted Flight data although this document negotiated HTML streaming only.");
                case DotReactRenderStreamCompleteFrame:
                    {
                        var tail = new StringBuilder(384 + hydration.Length);
                        tail.Append("</div><script id=\"__DOTREACT_DATA__\" type=\"application/json\">")
                            .Append(hydration).Append("</script>");
                        AppendReactRefreshPreamble(tail, options, nonce);
                        tail.Append("<script type=\"module\"");
                        AppendNonceAttribute(tail, nonce);
                        tail.Append(" src=\"").Append(HtmlEncoder.Default.Encode(options.ClientScriptSrc))
                            .Append("\"></script></body></html>");
                        await context.Response.WriteAsync(tail.ToString(), context.RequestAborted).ConfigureAwait(false);
                        await context.Response.Body.FlushAsync(context.RequestAborted).ConfigureAwait(false);
                        return;
                    }
                case DotReactRenderStreamErrorFrame error when !started || error.Phase == "before-shell":
                    throw new DotReactRendererException($"Renderer stream failed before its shell: {error.Code}.");
                case DotReactRenderStreamErrorFrame error:
                    logger.LogError(
                        "DotReact renderer stream {RequestId} failed after its shell with code {Code}.",
                        requestId, error.Code);
                    await context.Response.WriteAsync(
                        "</div><p role=\"alert\">The remainder of this page could not be rendered.</p></body></html>",
                        context.RequestAborted).ConfigureAwait(false);
                    await context.Response.Body.FlushAsync(context.RequestAborted).ConfigureAwait(false);
                    return;
            }
        }
    }

    private static async Task WritePrerenderedDocumentAsync(
        HttpContext context,
        string moduleId,
        JsonElement props,
        DotReactPrerenderMetadata metadata,
        DotReactOptions options,
        CancellationToken cancellationToken)
    {
        var path = context.Request.Path.ToUriComponent();
        var key = new DotReactPrerenderKey(options.PrerenderBuildId, path);
        var scopeFactory = context.RequestServices.GetRequiredService<IServiceScopeFactory>();
        var coordinator = context.RequestServices.GetRequiredService<DotReactPrerenderCoordinator>();
        var result = await coordinator.GetOrCreateAsync(
            key,
            generationToken => GeneratePrerenderArtifactAsync(
                scopeFactory, key, moduleId, props, metadata, options, generationToken),
            cancellationToken).ConfigureAwait(false);

        await WritePrerenderArtifactAsync(context, result.Artifact, result.Resolution).ConfigureAwait(false);
    }

    private static async ValueTask<bool> TryWriteFreshPrerenderedDocumentAsync(
        HttpContext context,
        DotReactOptions options,
        CancellationToken cancellationToken)
    {
        var key = new DotReactPrerenderKey(options.PrerenderBuildId, context.Request.Path.ToUriComponent());
        var store = context.RequestServices.GetRequiredService<IDotReactPrerenderStore>();
        var artifact = await store.GetAsync(key, cancellationToken).ConfigureAwait(false);
        if (artifact is null ||
            context.RequestServices.GetRequiredService<TimeProvider>().GetUtcNow() >= artifact.FreshUntil)
        {
            return false;
        }

        await WritePrerenderArtifactAsync(context, artifact, DotReactPrerenderResolution.Fresh)
            .ConfigureAwait(false);
        return true;
    }

    private static async Task WritePrerenderArtifactAsync(
        HttpContext context,
        DotReactPrerenderArtifact artifact,
        DotReactPrerenderResolution resolution)
    {
        var etag = $"\"{Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(artifact.Html))).ToLowerInvariant()}\"";
        context.Response.Headers.CacheControl = "public,max-age=0,must-revalidate";
        context.Response.Headers.ETag = etag;
        context.Response.Headers["X-DotReact-Prerender"] = resolution.ToString();
        if (context.Request.Headers.IfNoneMatch.Any(value =>
                value is not null && value.Split(',').Any(candidate => candidate.Trim() == etag)))
        {
            context.Response.StatusCode = StatusCodes.Status304NotModified;
            return;
        }
        context.Response.StatusCode = StatusCodes.Status200OK;
        context.Response.ContentType = "text/html; charset=utf-8";
        await context.Response.WriteAsync(artifact.Html, context.RequestAborted).ConfigureAwait(false);
    }

    private static async ValueTask<DotReactPrerenderArtifact> GeneratePrerenderArtifactAsync(
        IServiceScopeFactory scopeFactory,
        DotReactPrerenderKey key,
        string moduleId,
        JsonElement props,
        DotReactPrerenderMetadata metadata,
        DotReactOptions options,
        CancellationToken cancellationToken)
    {
        await using var scope = scopeFactory.CreateAsyncScope();
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(options.RequestTimeout);
        var renderer = scope.ServiceProvider.GetRequiredService<IDotReactRenderer>();
        var requestId = CreatePrerenderRequestId(key);
        var result = await renderer.RenderAsync(new DotReactRenderRequest(
            1, requestId, moduleId, key.Path, props, "ssr"), timeout.Token).ConfigureAwait(false);
        var hydration = JsonSerializer.Serialize(new StaticHydrationPayload(
            1, requestId, moduleId, props, null), JsonOptions);
        var html = BuildShell(result, moduleId, hydration, null, options, null);
        var generatedAt = scope.ServiceProvider.GetRequiredService<TimeProvider>().GetUtcNow();
        return DotReactPrerenderArtifact.Create(
            key,
            html,
            generatedAt,
            metadata.FreshFor,
            metadata.StaleWhileRevalidateFor,
            metadata.Tags);
    }

    private static string CreatePrerenderRequestId(DotReactPrerenderKey key)
    {
        var input = Encoding.UTF8.GetBytes($"{key.BuildId}\n{key.Path}");
        return "prerender-" + Convert.ToHexString(SHA256.HashData(input)).ToLowerInvariant();
    }

    private static bool IsClientNavigation(HttpRequest request) =>
        HttpMethods.IsGet(request.Method)
        && string.Equals(request.Headers["X-DotReact-Navigation"].ToString(), "1", StringComparison.Ordinal)
        && request.GetTypedHeaders().Accept?.Any(value =>
            string.Equals(value.MediaType.Value, "application/vnd.dotreact.navigation+json", StringComparison.OrdinalIgnoreCase)) == true;

    private static JsonElement SerializePageProps<TProps>(
        TProps props,
        string moduleId,
        DotReactOptions options,
        HttpContext context)
    {
        var utf8 = JsonSerializer.SerializeToUtf8Bytes(props, JsonOptions);
        DotReactTelemetry.PagePropsSize.Record(utf8.LongLength,
            new KeyValuePair<string, object?>("dotreact.module_id", moduleId));
        if (options.Development)
            context.Response.Headers["X-DotReact-Props-Bytes"] = utf8.Length.ToString(System.Globalization.CultureInfo.InvariantCulture);
        if (utf8.Length > options.MaxSerializedPropsBytes)
            throw new InvalidOperationException(
                $"Page '{moduleId}' serialized {utf8.Length} bytes of props, exceeding the configured " +
                $"MaxSerializedPropsBytes limit of {options.MaxSerializedPropsBytes} bytes.");
        using var document = JsonDocument.Parse(utf8);
        return document.RootElement.Clone();
    }

    private static void AppendServerTiming(
        HttpContext context,
        DotReactOptions options,
        string metric,
        TimeSpan duration)
    {
        if (!options.Development || context.Response.HasStarted) return;
        context.Response.Headers.Append("Server-Timing",
            $"dotreact-{metric};dur={duration.TotalMilliseconds.ToString("0.###", System.Globalization.CultureInfo.InvariantCulture)}");
    }

    private static async Task WriteNavigationPayloadAsync(
        HttpContext context,
        string requestId,
        string moduleId,
        JsonElement props,
        string? csrfToken,
        string? boundaryKind,
        int statusCode)
    {
        context.Response.StatusCode = statusCode;
        await context.Response.WriteAsJsonAsync(new NavigationPayload(
            1,
            requestId,
            moduleId,
            context.Request.GetEncodedPathAndQuery(),
            props,
            csrfToken,
            boundaryKind,
            statusCode), JsonOptions,
            contentType: "application/vnd.dotreact.navigation+json; charset=utf-8",
            cancellationToken: context.RequestAborted).ConfigureAwait(false);
    }

    private static void AppendReactRefreshPreamble(StringBuilder builder, DotReactOptions options, string? nonce)
    {
        if (!options.Development || string.IsNullOrWhiteSpace(options.ReactRefreshPreambleSrc))
        {
            return;
        }

        var refreshModule = JsonSerializer.Serialize(options.ReactRefreshPreambleSrc, JsonOptions);
        builder.Append("<script type=\"module\"");
        AppendNonceAttribute(builder, nonce);
        builder.Append(">import RefreshRuntime from ")
            .Append(refreshModule)
            .Append(";RefreshRuntime.injectIntoGlobalHook(window);")
            .Append("window.$RefreshReg$=()=>{};")
            .Append("window.$RefreshSig$=()=>type=>type;")
            .Append("window.__vite_plugin_react_preamble_installed__=true;");
        if (!string.IsNullOrWhiteSpace(options.DevelopmentRuntimeProbePath))
        {
            var runtimeProbe = JsonSerializer.Serialize(options.DevelopmentRuntimeProbePath, JsonOptions);
            builder.Append("let __dotReactRuntimeInstance;let __dotReactRuntimeRevision;")
                .Append("const __dotReactPollRuntime=async()=>{try{const response=await fetch(")
                .Append(runtimeProbe)
                .Append(",{cache:'no-store'});if(response.ok){const payload=await response.json();")
                .Append("if(__dotReactRuntimeInstance&&payload.instanceId!==__dotReactRuntimeInstance){location.reload();return;}")
                .Append("if(__dotReactRuntimeRevision!==undefined&&payload.revision!==__dotReactRuntimeRevision){window.dispatchEvent(new CustomEvent('dotreact:revalidate',{detail:[location.pathname+location.search]}));}")
                .Append("__dotReactRuntimeInstance=payload.instanceId;__dotReactRuntimeRevision=payload.revision;}}catch{}setTimeout(__dotReactPollRuntime,250);};")
                .Append("__dotReactPollRuntime();");
        }
        builder.Append("</script>");
    }

    private static void AppendClientStyles(StringBuilder builder, DotReactOptions options, string moduleId)
    {
        AppendStyle(builder, options.ClientStyleSrc);
        if (options.ClientRouteAssets.TryGetValue(moduleId, out var assets))
            foreach (var style in assets.Styles) AppendStyle(builder, style);
        if (string.IsNullOrWhiteSpace(options.ClientRouteStyleSrc)) return;
        var moduleKey = Convert.ToBase64String(Encoding.UTF8.GetBytes(moduleId))
            .TrimEnd('=')
            .Replace('+', '-')
            .Replace('/', '_');
        var routeStyle = options.ClientRouteStyleSrc.Replace(
            "{moduleId}",
            Uri.EscapeDataString(moduleId),
            StringComparison.Ordinal).Replace(
                "{moduleKey}",
                moduleKey,
                StringComparison.Ordinal);
        AppendStyle(builder, routeStyle);
    }

    private static void AppendBrowserVitalsMeta(StringBuilder builder, DotReactOptions options)
    {
        if (!options.EnableBrowserVitals) return;
        builder.Append("<meta name=\"dotreact-vitals-endpoint\" content=\"")
            .Append(HtmlEncoder.Default.Encode(options.BrowserVitalsEndpointPath))
            .Append("\">");
    }

    private static void AppendClientModulePreloads(
        StringBuilder builder,
        DotReactOptions options,
        string moduleId)
    {
        if (!options.ClientRouteAssets.TryGetValue(moduleId, out var assets)) return;
        foreach (var source in assets.ModulePreloads)
            builder.Append("<link rel=\"modulepreload\" href=\"")
                .Append(HtmlEncoder.Default.Encode(source)).Append("\">");
    }

    private static void AppendStyle(StringBuilder builder, string? source)
    {
        if (string.IsNullOrWhiteSpace(source)) return;
        builder.Append("<link rel=\"stylesheet\" href=\"")
            .Append(HtmlEncoder.Default.Encode(source))
            .Append("\">");
    }

    private static void AppendNonceAttribute(StringBuilder builder, string? nonce)
    {
        if (nonce is not null)
            builder.Append(" nonce=\"").Append(HtmlEncoder.Default.Encode(nonce)).Append('"');
    }

    private static void AppendHead(StringBuilder builder, IReadOnlyList<DotReactHeadElement> elements)
    {
        foreach (var element in elements)
        {
            switch (element.Kind)
            {
                case "title":
                    builder.Append("<title>")
                        .Append(HtmlEncoder.Default.Encode(element.Content ?? string.Empty))
                        .Append("</title>");
                    break;
                case "meta":
                    AppendVoidHeadElement(builder, "meta", element.Attrs, MetaAttributes);
                    break;
                case "link":
                    AppendVoidHeadElement(builder, "link", element.Attrs, LinkAttributes);
                    break;
                case "script":
                    AppendScriptHeadElement(builder, element.Attrs);
                    break;
            }
        }
    }

    private static void AppendVoidHeadElement(
        StringBuilder builder,
        string tag,
        IReadOnlyDictionary<string, string>? attributes,
        IReadOnlySet<string> allowedAttributes)
    {
        builder.Append('<').Append(tag);
        if (attributes is not null)
        {
            foreach (var (name, value) in attributes)
            {
                var normalizedName = name.ToLowerInvariant();
                if (!allowedAttributes.Contains(normalizedName))
                {
                    continue;
                }

                builder.Append(' ').Append(normalizedName).Append("=\"")
                    .Append(HtmlEncoder.Default.Encode(value)).Append('"');
            }
        }

        builder.Append('>');
    }

    private static void AppendScriptHeadElement(
        StringBuilder builder,
        IReadOnlyDictionary<string, string>? attributes)
    {
        if (attributes is null || !attributes.TryGetValue("src", out var source) || !IsSafeScriptSource(source)
            || (IsRemoteScriptSource(source) && !HasValidScriptIntegrity(attributes)))
            return;
        builder.Append("<script");
        foreach (var (name, value) in attributes)
        {
            var normalizedName = name.ToLowerInvariant();
            if (!ScriptAttributes.Contains(normalizedName)) continue;
            builder.Append(' ').Append(normalizedName).Append("=\"")
                .Append(HtmlEncoder.Default.Encode(value)).Append('"');
        }
        if (IsRemoteScriptSource(source) && !attributes.Keys.Any(static name =>
                name.Equals("crossorigin", StringComparison.OrdinalIgnoreCase)))
            builder.Append(" crossorigin=\"anonymous\"");
        builder.Append("></script>");
    }

    private static bool IsSafeScriptSource(string source)
    {
        if (IsLocalPath(source))
        {
            var separator = source.IndexOfAny(['?', '#']);
            var path = separator < 0 ? source : source[..separator];
            return !path.Split('/').Any(segment => segment is "." or "..");
        }
        return Uri.TryCreate(source, UriKind.Absolute, out var uri)
            && uri.Scheme == Uri.UriSchemeHttps
            && string.IsNullOrEmpty(uri.UserInfo);
    }

    private static bool IsRemoteScriptSource(string source) =>
        Uri.TryCreate(source, UriKind.Absolute, out var uri) && uri.Scheme == Uri.UriSchemeHttps;

    private static bool HasValidScriptIntegrity(IReadOnlyDictionary<string, string> attributes)
    {
        var integrity = attributes.FirstOrDefault(static pair =>
            pair.Key.Equals("integrity", StringComparison.OrdinalIgnoreCase)).Value;
        return integrity is not null && Regex.IsMatch(integrity,
            "^sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2}(?:\\s+sha(?:256|384|512)-[A-Za-z0-9+/]+={0,2})*$",
            RegexOptions.CultureInvariant,
            TimeSpan.FromMilliseconds(100));
    }

    private static async Task WriteErrorAsync(
        HttpContext context,
        DotReactOptions options,
        string requestId,
        string detail,
        int statusCode)
    {
        if (context.Response.HasStarted)
        {
            return;
        }

        context.Response.Clear();
        context.Response.Headers.CacheControl = "private,no-store";
        if (statusCode == StatusCodes.Status503ServiceUnavailable)
            context.Response.Headers.RetryAfter = "1";
        context.Response.StatusCode = statusCode;
        context.Response.ContentType = "text/html; charset=utf-8";
        var title = statusCode switch
        {
            StatusCodes.Status404NotFound => "Not found",
            StatusCodes.Status503ServiceUnavailable => "Temporarily unavailable",
            StatusCodes.Status504GatewayTimeout => "Render timeout",
            _ => "Render failed"
        };
        var nonce = DotReactSecurityNonce.Get(context);
        var nonceAttribute = nonce is null ? string.Empty : $" nonce=\"{HtmlEncoder.Default.Encode(nonce)}\"";
        var body = $$$"""
            <!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
            <title>{{{WebUtility.HtmlEncode(title)}}}</title><style{{{nonceAttribute}}}>
            :root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f4f7fb;color:#0b1636}main{width:min(92vw,36rem);padding:2rem;border:1px solid #dce4ef;border-radius:1rem;background:#fff;box-shadow:0 1rem 3rem rgba(11,22,54,.08)}h1{margin:0 0 .75rem;font-size:clamp(1.5rem,4vw,2rem)}p{margin:.5rem 0;color:#42526b;line-height:1.6}small{display:block;margin-top:1.5rem;color:#738198}a{display:inline-block;margin-top:1rem;padding:.7rem 1rem;border-radius:.65rem;background:#075ef7;color:#fff;font-weight:650;text-decoration:none}@media(prefers-color-scheme:dark){body{background:#071127;color:#f7f9fc}main{background:#0d1b36;border-color:#263858}p,small{color:#aebbd0}}
            </style></head><body><main><h1>{{{WebUtility.HtmlEncode(title)}}}</h1><p>{{{WebUtility.HtmlEncode(detail)}}}</p><a href="">Try again</a><small>Request ID: {{{WebUtility.HtmlEncode(requestId)}}}</small></main></body></html>
            """;
        await context.Response.WriteAsync(body, context.RequestAborted).ConfigureAwait(false);
    }

    private static readonly IReadOnlySet<string> MetaAttributes = new HashSet<string>(StringComparer.Ordinal)
    {
        "charset", "content", "http-equiv", "name", "property"
    };

    private static readonly IReadOnlySet<string> LinkAttributes = new HashSet<string>(StringComparer.Ordinal)
    {
        "as", "crossorigin", "fetchpriority", "href", "hreflang", "imagesizes", "imagesrcset",
        "integrity", "media", "referrerpolicy", "rel", "sizes", "type"
    };

    private static readonly IReadOnlySet<string> ScriptAttributes = new HashSet<string>(StringComparer.Ordinal)
    {
        "crossorigin", "data-dotreact-script", "defer", "integrity", "referrerpolicy", "src", "type"
    };

    private sealed record HydrationPayload(
        int ProtocolVersion,
        string RequestId,
        string ModuleId,
        JsonElement Props,
        string? CsrfToken,
        string? BoundaryKind);

    private sealed record StaticHydrationPayload(
        int ProtocolVersion,
        string RequestId,
        string ModuleId,
        JsonElement Props,
        string? BoundaryKind);

    private sealed record NavigationPayload(
        int ProtocolVersion,
        string RequestId,
        string ModuleId,
        string Url,
        JsonElement Props,
        string? CsrfToken,
        string? BoundaryKind,
        int StatusCode);

    private sealed record PrerenderManifest(
        int Version,
        string BuildId,
        IReadOnlyList<PrerenderManifestEntry> Routes);

    private sealed record PrerenderManifestEntry(
        string Path,
        string ModuleId,
        int? RevalidateSeconds,
        IReadOnlyList<string> Tags);
}
