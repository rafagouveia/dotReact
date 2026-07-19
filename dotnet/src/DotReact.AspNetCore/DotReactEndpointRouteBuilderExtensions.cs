using System.Diagnostics;
using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using System.Reflection;
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
                .Invoke(null, [endpoints, page.Pattern, page.ModuleId]);
        }
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
        IEndpointRouteBuilder endpoints, string pattern, string moduleId)
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
            }));
        ApplyPageAuthorization<TPage>(builder);
    }

    private static void MapDiscoveredResultPage<TPage, TProps>(
        IEndpointRouteBuilder endpoints, string pattern, string moduleId)
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
            }));
        ApplyPageAuthorization<TPage>(builder);
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
        if (invalidator is null) return;
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
        Func<HttpContext, CancellationToken, ValueTask<DotReactPageResult<TProps>>> loader)
    {
        context.Response.Headers.CacheControl = "private,no-store";
        var options = context.RequestServices.GetRequiredService<IOptions<DotReactOptions>>().Value;
        var logger = context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("DotReact");
        var requestId = Activity.Current?.TraceId.ToString() ?? context.TraceIdentifier;

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
        timeout.CancelAfter(options.RequestTimeout);

        try
        {
            var outcome = await loader(context, timeout.Token).ConfigureAwait(false)
                ?? throw new InvalidOperationException("A DotReact result page returned null.");
            if (outcome.Kind == DotReactPageResultKind.Redirect)
            {
                context.Response.StatusCode = outcome.StatusCode;
                context.Response.Headers.Location = outcome.Location!;
                return;
            }

            if (outcome.Kind == DotReactPageResultKind.NotFound)
            {
                var rendered = await TryRenderBoundaryAsync(
                    context, moduleId, "not-found", requestId, StatusCodes.Status404NotFound,
                    "The requested page was not found.", options, logger, timeout.Token).ConfigureAwait(false);
                if (!rendered)
                    await WriteErrorAsync(context, options, requestId, "The requested page was not found.",
                        StatusCodes.Status404NotFound).ConfigureAwait(false);
                return;
            }

            var props = outcome.Props;
            var antiforgery = context.RequestServices.GetRequiredService<IAntiforgery>();
            var csrfToken = antiforgery.GetAndStoreTokens(context).RequestToken
                ?? throw new InvalidOperationException("The antiforgery service did not issue a request token.");
            var propsJson = JsonSerializer.SerializeToElement(props, JsonOptions);
            var renderer = context.RequestServices.GetRequiredService<IDotReactRenderer>();
            var result = await renderer.RenderAsync(
                new DotReactRenderRequest(
                    1,
                    requestId,
                    moduleId,
                    context.Request.GetEncodedPathAndQuery(),
                    propsJson,
                    "ssr"),
                timeout.Token).ConfigureAwait(false);

            var hydration = JsonSerializer.Serialize(new HydrationPayload(
                1, requestId, moduleId, propsJson, csrfToken, null), JsonOptions);

            context.Response.StatusCode = outcome.StatusCode;
            context.Response.ContentType = "text/html; charset=utf-8";
            await context.Response.WriteAsync(BuildShell(result, hydration, csrfToken, options), context.RequestAborted)
                .ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (!context.RequestAborted.IsCancellationRequested)
        {
            logger.LogWarning("DotReact request {RequestId} timed out after {Timeout}.", requestId, options.RequestTimeout);
            await WriteErrorAsync(context, options, requestId, "The renderer request timed out.",
                StatusCodes.Status504GatewayTimeout).ConfigureAwait(false);
        }
        catch (Exception exception) when (!context.RequestAborted.IsCancellationRequested)
        {
            logger.LogError(exception, "DotReact request {RequestId} failed.", requestId);
            var detail = options.Development ? exception.ToString() : "The page could not be rendered.";
            var rendered = await TryRenderBoundaryAsync(
                context, moduleId, "error", requestId, StatusCodes.Status500InternalServerError,
                options.Development ? exception.Message : "The page could not be rendered.",
                options, logger, context.RequestAborted).ConfigureAwait(false);
            if (!rendered)
                await WriteErrorAsync(context, options, requestId, detail, StatusCodes.Status500InternalServerError)
                    .ConfigureAwait(false);
        }
    }

    private static async Task HandleFallbackAsync(HttpContext context, string rootModuleId)
    {
        context.Response.Headers.CacheControl = "private,no-store";
        var options = context.RequestServices.GetRequiredService<IOptions<DotReactOptions>>().Value;
        var logger = context.RequestServices.GetRequiredService<ILoggerFactory>().CreateLogger("DotReact");
        var requestId = Activity.Current?.TraceId.ToString() ?? context.TraceIdentifier;
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
            await context.Response.WriteAsync(BuildShell(result, hydration, null, options), context.RequestAborted)
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
        string hydrationJson,
        string? csrfToken,
        DotReactOptions options)
    {
        var rootId = HtmlEncoder.Default.Encode(options.RootElementId);
        var scriptSrc = HtmlEncoder.Default.Encode(options.ClientScriptSrc);
        var builder = new StringBuilder(512 + render.Html.Length + hydrationJson.Length);
        builder.Append("<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">");
        if (csrfToken is not null)
            builder.Append("<meta name=\"dotreact-csrf-token\" content=\"")
                .Append(HtmlEncoder.Default.Encode(csrfToken)).Append("\">");
        AppendHead(builder, render.Head);
        builder.Append("</head><body><div id=\"").Append(rootId).Append("\">");
        builder.Append(render.Html);
        builder.Append("</div><script id=\"__DOTREACT_DATA__\" type=\"application/json\">");
        builder.Append(hydrationJson);
        builder.Append("</script>");
        AppendReactRefreshPreamble(builder, options);
        builder.Append("<script type=\"module\" src=\"").Append(scriptSrc).Append("\"></script></body></html>");
        return builder.ToString();
    }

    private static void AppendReactRefreshPreamble(StringBuilder builder, DotReactOptions options)
    {
        if (!options.Development || string.IsNullOrWhiteSpace(options.ReactRefreshPreambleSrc))
        {
            return;
        }

        var refreshModule = JsonSerializer.Serialize(options.ReactRefreshPreambleSrc, JsonOptions);
        builder.Append("<script type=\"module\">import RefreshRuntime from ")
            .Append(refreshModule)
            .Append(";RefreshRuntime.injectIntoGlobalHook(window);")
            .Append("window.$RefreshReg$=()=>{};")
            .Append("window.$RefreshSig$=()=>type=>type;")
            .Append("window.__vite_plugin_react_preamble_installed__=true;</script>");
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
        context.Response.StatusCode = statusCode;
        context.Response.ContentType = "text/html; charset=utf-8";
        var title = statusCode switch
        {
            StatusCodes.Status404NotFound => "Not found",
            StatusCodes.Status504GatewayTimeout => "Render timeout",
            _ => "Render failed"
        };
        var body = $"<!doctype html><html><body><h1>{title}</h1><p>{WebUtility.HtmlEncode(detail)}</p><small>Request ID: {WebUtility.HtmlEncode(requestId)}</small></body></html>";
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

    private sealed record HydrationPayload(
        int ProtocolVersion,
        string RequestId,
        string ModuleId,
        JsonElement Props,
        string? CsrfToken,
        string? BoundaryKind);
}
