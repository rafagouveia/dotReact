using System.Diagnostics;
using System.Net;

namespace DotReact.AspNetCore;

internal sealed class DotReactRendererTelemetryHandler : DelegatingHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        var operation = GetOperation(request.RequestUri);
        var operationTag = new KeyValuePair<string, object?>("dotreact.operation", operation);
        DotReactTelemetry.RendererRequests.Add(1, operationTag);

        using var activity = DotReactTelemetry.ActivitySource.StartActivity(
            $"dotreact.renderer.{operation}", ActivityKind.Client);
        activity?.SetTag("dotreact.operation", operation);
        activity?.SetTag("http.request.method", request.Method.Method);

        var started = Stopwatch.GetTimestamp();
        try
        {
            var response = await base.SendAsync(request, cancellationToken).ConfigureAwait(false);
            var statusCode = (int)response.StatusCode;
            var outcome = response.IsSuccessStatusCode ? "success" : "error";
            Record(started, operation, outcome, response.StatusCode);
            activity?.SetTag("http.response.status_code", statusCode);
            if (!response.IsSuccessStatusCode)
            {
                activity?.SetStatus(ActivityStatusCode.Error);
                DotReactTelemetry.RendererErrors.Add(1, operationTag,
                    new KeyValuePair<string, object?>("error.type", "http_status"));
            }
            return response;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            Record(started, operation, "canceled", null);
            activity?.SetTag("error.type", "canceled");
            activity?.SetStatus(ActivityStatusCode.Error);
            DotReactTelemetry.RendererErrors.Add(1, operationTag,
                new KeyValuePair<string, object?>("error.type", "canceled"));
            throw;
        }
        catch (Exception exception)
        {
            var errorType = exception.GetType().FullName ?? exception.GetType().Name;
            Record(started, operation, "error", null);
            activity?.SetTag("error.type", errorType);
            activity?.SetStatus(ActivityStatusCode.Error);
            DotReactTelemetry.RendererErrors.Add(1, operationTag,
                new KeyValuePair<string, object?>("error.type", errorType));
            throw;
        }
    }

    private static void Record(long started, string operation, string outcome, HttpStatusCode? statusCode)
    {
        var tags = new TagList
        {
            { "dotreact.operation", operation },
            { "dotreact.outcome", outcome }
        };
        if (statusCode is not null) tags.Add("http.response.status_code", (int)statusCode.Value);
        DotReactTelemetry.RendererDuration.Record(Stopwatch.GetElapsedTime(started).TotalSeconds, tags);
    }

    private static string GetOperation(Uri? requestUri)
    {
        var path = requestUri?.AbsolutePath ?? requestUri?.OriginalString ?? string.Empty;
        if (path.EndsWith("/__dotreact/render", StringComparison.Ordinal)) return "render";
        if (path.EndsWith("/__dotreact/ready", StringComparison.Ordinal)) return "readiness";
        return "request";
    }
}
