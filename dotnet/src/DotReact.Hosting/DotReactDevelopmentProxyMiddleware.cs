using System.Buffers;
using System.Net;
using System.Net.Http.Headers;
using System.Net.WebSockets;
using System.Text.Json;
using DotReact.AspNetCore;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace DotReact.Hosting;

/// <summary>
/// Keeps Vite and React Refresh private by proxying their development traffic
/// through the public ASP.NET Core origin.
/// </summary>
internal sealed class DotReactDevelopmentProxyMiddleware(
    RequestDelegate next,
    IHttpClientFactory httpClientFactory,
    IOptions<DotReactOptions> options,
    ILogger<DotReactDevelopmentProxyMiddleware> logger)
{
    internal const string HttpClientName = "DotReactDevelopmentAssets";
    private static readonly PathString DevelopmentPathBase = new("/_dotreact/dev");
    private static readonly string DevelopmentInstanceId = Guid.NewGuid().ToString("N");
    private static readonly HashSet<string> HopByHopHeaders = new(StringComparer.OrdinalIgnoreCase)
    {
        "Connection",
        "Keep-Alive",
        "Proxy-Authenticate",
        "Proxy-Authorization",
        "TE",
        "Trailer",
        "Transfer-Encoding",
        "Upgrade"
    };

    public async Task InvokeAsync(HttpContext context)
    {
        if (!context.Request.Path.StartsWithSegments(DevelopmentPathBase))
        {
            await next(context);
            return;
        }

        if (!options.Value.Development)
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            return;
        }

        if (string.Equals(
            context.Request.Path.Value,
            options.Value.DevelopmentRuntimeProbePath,
            StringComparison.Ordinal))
        {
            if (context.WebSockets.IsWebSocketRequest)
            {
                await HandleRuntimeWebSocketAsync(context);
                return;
            }
            context.Response.Headers.CacheControl = "no-store";
            context.Response.Headers.XContentTypeOptions = "nosniff";
            await context.Response.WriteAsJsonAsync(
                new
                {
                    instanceId = DevelopmentInstanceId,
                    revision = DotReactDevelopmentRevision.Current
                },
                context.RequestAborted);
            return;
        }

        if (context.WebSockets.IsWebSocketRequest)
        {
            await ProxyWebSocketAsync(context);
            return;
        }

        await ProxyHttpAsync(context);
    }

    private static async Task HandleRuntimeWebSocketAsync(HttpContext context)
    {
        using var socket = await context.WebSockets.AcceptWebSocketAsync();
        var revision = DotReactDevelopmentRevision.Current;
        await SendRuntimeStateAsync(socket, revision, context.RequestAborted);
        try
        {
            while (socket.State == WebSocketState.Open)
            {
                revision = await DotReactDevelopmentRevision.WaitForChangeAsync(
                    revision, context.RequestAborted);
                await SendRuntimeStateAsync(socket, revision, context.RequestAborted);
            }
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
        }
        catch (WebSocketException) when (socket.State != WebSocketState.Open)
        {
        }
    }

    private static Task SendRuntimeStateAsync(WebSocket socket, long revision, CancellationToken cancellationToken)
    {
        var payload = JsonSerializer.SerializeToUtf8Bytes(new
        {
            instanceId = DevelopmentInstanceId,
            revision
        });
        return socket.SendAsync(payload, WebSocketMessageType.Text, true, cancellationToken);
    }

    private async Task ProxyHttpAsync(HttpContext context)
    {
        var target = BuildTargetUri(context, websocket: false);
        using var request = new HttpRequestMessage(new HttpMethod(context.Request.Method), target);
        var hasBody = context.Request.ContentLength is > 0
            || context.Request.Headers.ContainsKey("Transfer-Encoding");
        if (hasBody) request.Content = new StreamContent(context.Request.Body);

        foreach (var header in context.Request.Headers)
        {
            if (header.Key.Equals("Host", StringComparison.OrdinalIgnoreCase)
                || HopByHopHeaders.Contains(header.Key)) continue;
            if (!request.Headers.TryAddWithoutValidation(header.Key, header.Value.ToArray())
                && request.Content is not null)
            {
                request.Content.Headers.TryAddWithoutValidation(header.Key, header.Value.ToArray());
            }
        }

        HttpResponseMessage upstream;
        try
        {
            upstream = await httpClientFactory.CreateClient(HttpClientName).SendAsync(
                request,
                HttpCompletionOption.ResponseHeadersRead,
                context.RequestAborted);
        }
        catch (HttpRequestException exception)
        {
            logger.LogWarning(exception, "The DotReact development renderer could not serve {Path}.", context.Request.Path);
            context.Response.StatusCode = StatusCodes.Status502BadGateway;
            return;
        }

        using (upstream)
        {
            context.Response.StatusCode = (int)upstream.StatusCode;
            CopyResponseHeaders(upstream.Headers, context.Response.Headers);
            CopyResponseHeaders(upstream.Content.Headers, context.Response.Headers);
            // Development modules must never survive a framework/runtime restart in
            // browser or edge caches. A stale React module can otherwise coexist
            // with a fresh renderer and produce invalid hook dispatchers.
            context.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate, max-age=0";
            context.Response.Headers.Pragma = "no-cache";
            context.Response.Headers.Expires = "0";
            context.Response.Headers.Remove("ETag");
            await upstream.Content.CopyToAsync(context.Response.Body, context.RequestAborted);
        }
    }

    private async Task ProxyWebSocketAsync(HttpContext context)
    {
        using var upstream = new ClientWebSocket();
        foreach (var protocol in context.WebSockets.WebSocketRequestedProtocols)
            upstream.Options.AddSubProtocol(protocol);
        if (context.Request.Headers.TryGetValue("Origin", out var origin))
            upstream.Options.SetRequestHeader("Origin", origin.ToString());

        try
        {
            await upstream.ConnectAsync(BuildTargetUri(context, websocket: true), context.RequestAborted);
        }
        catch (WebSocketException exception)
        {
            logger.LogWarning(exception, "The DotReact development HMR socket could not connect.");
            context.Response.StatusCode = StatusCodes.Status502BadGateway;
            return;
        }

        using var downstream = await context.WebSockets.AcceptWebSocketAsync(upstream.SubProtocol);
        using var relayCancellation = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);
        var upstreamRelay = RelayAsync(downstream, upstream, relayCancellation.Token);
        var downstreamRelay = RelayAsync(upstream, downstream, relayCancellation.Token);
        await Task.WhenAny(upstreamRelay, downstreamRelay);
        await relayCancellation.CancelAsync();
        try { await Task.WhenAll(upstreamRelay, downstreamRelay); }
        catch (OperationCanceledException) when (relayCancellation.IsCancellationRequested) { }
        catch (WebSocketException) when (relayCancellation.IsCancellationRequested) { }
    }

    private Uri BuildTargetUri(HttpContext context, bool websocket)
    {
        var pathAndQuery = $"{context.Request.PathBase}{context.Request.Path}{context.Request.QueryString}";
        var target = new Uri(options.Value.RendererUrl, pathAndQuery);
        if (!websocket) return target;
        return new UriBuilder(target)
        {
            Scheme = target.Scheme == Uri.UriSchemeHttps ? "wss" : "ws"
        }.Uri;
    }

    private static async Task RelayAsync(WebSocket source, WebSocket destination, CancellationToken cancellationToken)
    {
        var buffer = ArrayPool<byte>.Shared.Rent(16 * 1024);
        try
        {
            while (source.State is WebSocketState.Open or WebSocketState.CloseSent)
            {
                var result = await source.ReceiveAsync(buffer.AsMemory(), cancellationToken);
                if (result.MessageType == WebSocketMessageType.Close)
                {
                    if (destination.State == WebSocketState.Open)
                    {
                        await destination.CloseOutputAsync(
                            source.CloseStatus ?? WebSocketCloseStatus.NormalClosure,
                            source.CloseStatusDescription,
                            cancellationToken);
                    }
                    return;
                }

                await destination.SendAsync(
                    buffer.AsMemory(0, result.Count),
                    result.MessageType,
                    result.EndOfMessage,
                    cancellationToken);
            }
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }
    }

    private static void CopyResponseHeaders(HttpHeaders source, IHeaderDictionary destination)
    {
        foreach (var header in source)
        {
            if (!HopByHopHeaders.Contains(header.Key)) destination[header.Key] = header.Value.ToArray();
        }
    }
}
