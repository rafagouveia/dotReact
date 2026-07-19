using System.Diagnostics;
using Microsoft.AspNetCore.Http;

namespace DotReact.AspNetCore;

internal sealed class DotReactActionTelemetryFilter(string actionId) : IEndpointFilter
{
    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context,
        EndpointFilterDelegate next)
    {
        DotReactTelemetry.ActionRequests.Add(1,
            new KeyValuePair<string, object?>("dotreact.action_id", actionId));
        var activity = DotReactTelemetry.ActivitySource.StartActivity(
            "dotreact.action.execute", ActivityKind.Internal);
        activity?.SetTag("dotreact.action_id", actionId);
        var started = Stopwatch.GetTimestamp();
        try
        {
            var result = await next(context).ConfigureAwait(false);
            return result is IResult httpResult
                ? new TelemetryResult(httpResult, actionId, started, activity)
                : Complete(result, context.HttpContext.Response.StatusCode, actionId, started, activity);
        }
        catch (OperationCanceledException) when (context.HttpContext.RequestAborted.IsCancellationRequested)
        {
            DotReactTelemetry.RecordAction(started, actionId, "canceled", null, activity);
            throw;
        }
        catch (Exception exception)
        {
            DotReactTelemetry.RecordAction(started, actionId, "error",
                StatusCodes.Status500InternalServerError, activity, exception.GetType().FullName);
            throw;
        }
    }

    private static object? Complete(
        object? result,
        int statusCode,
        string actionId,
        long started,
        Activity? activity)
    {
        DotReactTelemetry.RecordAction(started, actionId, Outcome(statusCode), statusCode, activity);
        return result;
    }

    private static string Outcome(int statusCode) => statusCode switch
    {
        < 400 => "success",
        < 500 => "rejected",
        _ => "error"
    };

    private sealed class TelemetryResult(
        IResult inner,
        string actionId,
        long started,
        Activity? activity) : IResult
    {
        public async Task ExecuteAsync(HttpContext httpContext)
        {
            try
            {
                await inner.ExecuteAsync(httpContext).ConfigureAwait(false);
                DotReactTelemetry.RecordAction(started, actionId, Outcome(httpContext.Response.StatusCode),
                    httpContext.Response.StatusCode, activity);
            }
            catch (OperationCanceledException) when (httpContext.RequestAborted.IsCancellationRequested)
            {
                DotReactTelemetry.RecordAction(started, actionId, "canceled", null, activity);
                throw;
            }
            catch (Exception exception)
            {
                DotReactTelemetry.RecordAction(started, actionId, "error",
                    StatusCodes.Status500InternalServerError, activity, exception.GetType().FullName);
                throw;
            }
        }
    }
}
