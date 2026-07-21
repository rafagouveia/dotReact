using System.Collections.Concurrent;
using System.Buffers.Binary;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace DotReact.AspNetCore;

/// <summary>Coalesces identical in-flight SSR work without retaining rendered user data.</summary>
internal sealed class DotReactRenderCoordinator(
    IOptions<DotReactOptions> options,
    DotReactRenderAdmissionController admission)
{
    private readonly ConcurrentDictionary<string, Task<DotReactRenderResponse>> _flights = [];

    public async Task<DotReactRenderResponse> RenderAsync(
        DotReactRenderRequest request,
        Func<DotReactRenderRequest, CancellationToken, Task<DotReactRenderResponse>> render,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        ArgumentNullException.ThrowIfNull(render);
        var key = Key(request);
        if (_flights.Count >= options.Value.MaxCoalescedRenders)
            return await RenderBoundedAsync(request, render)
                .WaitAsync(cancellationToken).ConfigureAwait(false);

        var task = _flights.GetOrAdd(key, _ => RenderBoundedAsync(request, render));
        try
        {
            var response = await task.WaitAsync(cancellationToken).ConfigureAwait(false);
            return response.RequestId == request.RequestId ? response : response with { RequestId = request.RequestId };
        }
        finally
        {
            if (task.IsCompleted)
                _flights.TryRemove(new KeyValuePair<string, Task<DotReactRenderResponse>>(key, task));
        }
    }

    private async Task<DotReactRenderResponse> RenderBoundedAsync(
        DotReactRenderRequest request,
        Func<DotReactRenderRequest, CancellationToken, Task<DotReactRenderResponse>> render)
    {
        using var timeout = new CancellationTokenSource(options.Value.RequestTimeout);
        return await admission.ExecuteAsync(
            cancellationToken => render(request, cancellationToken), timeout.Token).ConfigureAwait(false);
    }

    private static string Key(DotReactRenderRequest request)
    {
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        Append(hash, request.ProtocolVersion.ToString(System.Globalization.CultureInfo.InvariantCulture));
        Append(hash, request.ModuleId);
        Append(hash, request.Url);
        Append(hash, request.RenderMode);
        Append(hash, request.BoundaryKind ?? string.Empty);
        if (request.SerializedProps.IsEmpty)
            Append(hash, JsonSerializer.SerializeToUtf8Bytes(request.Props));
        else
            Append(hash, request.SerializedProps.Span);
        return Convert.ToHexString(hash.GetHashAndReset());
    }

    private static void Append(IncrementalHash hash, string value) => Append(hash, Encoding.UTF8.GetBytes(value));

    private static void Append(IncrementalHash hash, ReadOnlySpan<byte> value)
    {
        Span<byte> length = stackalloc byte[4];
        BinaryPrimitives.WriteUInt32BigEndian(length, checked((uint)value.Length));
        hash.AppendData(length);
        hash.AppendData(value);
    }
}

/// <summary>Renderer decorator that applies bounded request coalescing.</summary>
internal sealed class DotReactCoalescingRenderer(
    DotReactRendererClient inner,
    DotReactRenderCoordinator coordinator) : IDotReactRenderer
{
    public Task<DotReactRenderResponse> RenderAsync(
        DotReactRenderRequest request,
        CancellationToken cancellationToken) =>
        coordinator.RenderAsync(request, inner.RenderAsync, cancellationToken);
}

/// <summary>Keeps streaming SSR inside the same bounded renderer budget as buffered SSR.</summary>
internal sealed class DotReactAdmissionStreamingRenderer(
    DotReactStreamingRendererClient inner,
    DotReactRenderAdmissionController admission) : IDotReactStreamingRenderer
{
    public IAsyncEnumerable<DotReactRenderStreamFrame> RenderStreamAsync(
        DotReactRenderStreamRequest request,
        CancellationToken cancellationToken) =>
        admission.ExecuteStreamAsync(
            token => inner.RenderStreamAsync(request, token), cancellationToken);
}
