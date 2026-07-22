using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Threading.RateLimiting;
using Microsoft.Extensions.Options;

namespace DotReact.AspNetCore;

/// <summary>Applies a bounded concurrency and queue budget before React SSR work starts.</summary>
internal sealed class DotReactRenderAdmissionController : IDisposable
{
    private readonly ConcurrencyLimiter _limiter;

    public DotReactRenderAdmissionController(IOptions<DotReactOptions> options)
    {
        var value = options.Value;
        var permitLimit = checked(value.RendererFrameConnectionCount
            * value.RendererFrameMaxInFlightPerConnection);
        var queueLimit = value.RendererMaxQueuedRequests < 0
            ? Math.Min(permitLimit, 256)
            : value.RendererMaxQueuedRequests;
        _limiter = new ConcurrencyLimiter(new ConcurrencyLimiterOptions
        {
            PermitLimit = permitLimit,
            QueueLimit = queueLimit,
            QueueProcessingOrder = QueueProcessingOrder.OldestFirst
        });
    }

    internal async Task<T> ExecuteAsync<T>(
        Func<CancellationToken, Task<T>> operation,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(operation);
        using var lease = await AcquireAsync(cancellationToken).ConfigureAwait(false);
        return await operation(cancellationToken).ConfigureAwait(false);
    }

    internal async IAsyncEnumerable<T> ExecuteStreamAsync<T>(
        Func<CancellationToken, IAsyncEnumerable<T>> operation,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(operation);
        using var lease = await AcquireAsync(cancellationToken).ConfigureAwait(false);
        await foreach (var item in operation(cancellationToken)
            .WithCancellation(cancellationToken).ConfigureAwait(false))
            yield return item;
    }

    private async ValueTask<AdmissionLease> AcquireAsync(CancellationToken cancellationToken)
    {
        var started = DotReactTelemetry.RendererAdmissionMetricsEnabled
            ? Stopwatch.GetTimestamp()
            : 0;
        var pending = _limiter.AcquireAsync(1, cancellationToken);
        var queued = !pending.IsCompletedSuccessfully;
        if (queued) DotReactTelemetry.RecordRendererQueueDelta(1);
        RateLimitLease lease;
        try { lease = await pending.ConfigureAwait(false); }
        finally { if (queued) DotReactTelemetry.RecordRendererQueueDelta(-1); }

        if (!lease.IsAcquired)
        {
            lease.Dispose();
            DotReactTelemetry.RecordRendererAdmission("rejected", started);
            throw new DotReactRendererCapacityException(
                "The bounded renderer capacity and queue are full.");
        }

        DotReactTelemetry.RecordRendererAdmission("admitted", started);
        DotReactTelemetry.RecordRendererActiveDelta(1);
        return new AdmissionLease(lease);
    }

    public void Dispose() => _limiter.Dispose();

    private sealed class AdmissionLease(RateLimitLease lease) : IDisposable
    {
        private RateLimitLease? _lease = lease;

        public void Dispose()
        {
            var value = Interlocked.Exchange(ref _lease, null);
            if (value is null) return;
            value.Dispose();
            DotReactTelemetry.RecordRendererActiveDelta(-1);
        }
    }
}
