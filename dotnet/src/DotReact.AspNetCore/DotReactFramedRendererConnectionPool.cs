using System.Collections.Concurrent;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace DotReact.AspNetCore;

/// <summary>Owns bounded persistent channels to the managed renderer.</summary>
internal sealed class DotReactFramedRendererConnectionPool : IAsyncDisposable
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly DotReactFramedRendererConnection[] _connections;
    private int _cursor = -1;

    public DotReactFramedRendererConnectionPool(IOptions<DotReactOptions> options)
    {
        var value = options.Value;
        _connections = Enumerable.Range(0, value.RendererFrameConnectionCount)
            .Select(_ => new DotReactFramedRendererConnection(value))
            .ToArray();
    }

    internal async Task<DotReactRenderResponse> RenderAsync(
        DotReactRenderRequest request,
        CancellationToken cancellationToken)
    {
        var index = (int)((uint)Interlocked.Increment(ref _cursor) % (uint)_connections.Length);
        var response = await _connections[index].RenderAsync(request, JsonOptions, cancellationToken)
            .ConfigureAwait(false);
        return DotReactBinaryRendererCodec.DecodeResponse(response.Span, request.RequestId, JsonOptions);
    }

    public async ValueTask DisposeAsync()
    {
        foreach (var connection in _connections)
            await connection.DisposeAsync().ConfigureAwait(false);
    }
}

internal sealed class DotReactFramedRendererConnection(DotReactOptions options) : IAsyncDisposable
{
    private readonly ConcurrentDictionary<string, TaskCompletionSource<ReadOnlyMemory<byte>>> _pending = [];
    private readonly SemaphoreSlim _connectionLock = new(1, 1);
    private readonly SemaphoreSlim _writeLock = new(1, 1);
    private readonly SemaphoreSlim _inFlight = new(
        options.RendererFrameMaxInFlightPerConnection,
        options.RendererFrameMaxInFlightPerConnection);
    private readonly CancellationTokenSource _lifetime = new();
    private Stream? _stream;
    private Task? _reader;

    internal async Task<ReadOnlyMemory<byte>> RenderAsync(
        DotReactRenderRequest request,
        JsonSerializerOptions jsonOptions,
        CancellationToken cancellationToken)
    {
        var payload = DotReactBinaryRendererCodec.EncodeRequest(request, jsonOptions);
        var attempts = Math.Max(1, options.RendererRetryCount + 1);
        Exception? lastError = null;
        for (var attempt = 0; attempt < attempts; attempt++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                return await SendAsync(request.RequestId, payload, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception exception) when (exception is IOException or SocketException or EndOfStreamException
                                               or ObjectDisposedException or DotReactRendererException)
            {
                lastError = exception;
                await ResetAsync(exception).ConfigureAwait(false);
                if (attempt + 1 < attempts && options.RendererRetryDelay > TimeSpan.Zero)
                {
                    var factor = Math.Pow(2, Math.Min(attempt, 6));
                    var delay = TimeSpan.FromMilliseconds(options.RendererRetryDelay.TotalMilliseconds * factor);
                    await Task.Delay(delay, cancellationToken).ConfigureAwait(false);
                }
            }
        }
        throw new DotReactRendererException("Persistent renderer transport failed after bounded retries.", lastError!);
    }

    private async Task<ReadOnlyMemory<byte>> SendAsync(
        string correlationId,
        ReadOnlyMemory<byte> payload,
        CancellationToken cancellationToken)
    {
        await _inFlight.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var stream = await GetConnectedStreamAsync(cancellationToken).ConfigureAwait(false);
            var completion = new TaskCompletionSource<ReadOnlyMemory<byte>>(
                TaskCreationOptions.RunContinuationsAsynchronously);
            if (!_pending.TryAdd(correlationId, completion))
                throw new DotReactRendererException("Renderer frame correlation collision.");
            try
            {
                var frame = DotReactFramedRendererProtocol.Encode(
                    DotReactRendererFrameKind.RenderRequest, correlationId, [], payload.Span);
                await _writeLock.WaitAsync(cancellationToken).ConfigureAwait(false);
                try
                {
                    await stream.WriteAsync(frame, cancellationToken).ConfigureAwait(false);
                    await stream.FlushAsync(cancellationToken).ConfigureAwait(false);
                }
                finally { _writeLock.Release(); }
                return await completion.Task.WaitAsync(options.RequestTimeout, cancellationToken).ConfigureAwait(false);
            }
            finally { _pending.TryRemove(correlationId, out _); }
        }
        finally { _inFlight.Release(); }
    }

    private async ValueTask<Stream> GetConnectedStreamAsync(CancellationToken cancellationToken)
    {
        if (_stream is not null) return _stream;
        await _connectionLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (_stream is not null) return _stream;
            if (string.IsNullOrWhiteSpace(options.RendererFrameSocketPath))
                throw new DotReactRendererException("Framed renderer endpoint is not configured.");
            using var connectTimeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken, _lifetime.Token);
            connectTimeout.CancelAfter(options.RendererConnectTimeout);
            var stream = await DotReactRendererInterprocessEndpoint.ConnectAsync(
                options.RendererFrameSocketPath, connectTimeout.Token).ConfigureAwait(false);
            try
            {
                var token = Encoding.UTF8.GetBytes(options.RendererToken ?? string.Empty);
                var authentication = DotReactFramedRendererProtocol.Encode(
                    DotReactRendererFrameKind.Authenticate, string.Empty, token, []);
                await stream.WriteAsync(authentication, connectTimeout.Token).ConfigureAwait(false);
                await stream.FlushAsync(connectTimeout.Token).ConfigureAwait(false);
                var acknowledgement = await DotReactFramedRendererProtocol.ReadAsync(stream, connectTimeout.Token)
                    .ConfigureAwait(false);
                if (acknowledgement?.Kind != DotReactRendererFrameKind.AuthenticationAccepted)
                    throw new DotReactRendererException("Renderer rejected the framed transport authentication.");
                _stream = stream;
                _reader = ReadResponsesAsync(stream, _lifetime.Token);
                return stream;
            }
            catch
            {
                await stream.DisposeAsync().ConfigureAwait(false);
                throw;
            }
        }
        finally { _connectionLock.Release(); }
    }

    private async Task ReadResponsesAsync(Stream stream, CancellationToken cancellationToken)
    {
        Exception? failure = null;
        try
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                var frame = await DotReactFramedRendererProtocol.ReadAsync(stream, cancellationToken)
                    .ConfigureAwait(false);
                if (frame is null) throw new EndOfStreamException("Renderer closed the framed channel.");
                if (frame.Value.Kind != DotReactRendererFrameKind.RenderResponse
                    || string.IsNullOrEmpty(frame.Value.CorrelationId))
                    throw new DotReactRendererException("Renderer returned an unexpected frame.");
                if (_pending.TryRemove(frame.Value.CorrelationId, out var completion))
                    completion.TrySetResult(frame.Value.Payload);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { }
        catch (Exception exception) { failure = exception; }
        finally
        {
            if (ReferenceEquals(Interlocked.CompareExchange(ref _stream, null, stream), stream))
                await stream.DisposeAsync().ConfigureAwait(false);
            var exception = failure ?? new IOException("Renderer framed channel closed.");
            foreach (var pending in _pending.ToArray())
                if (_pending.TryRemove(pending.Key, out var completion))
                    completion.TrySetException(exception);
        }
    }

    private async ValueTask ResetAsync(Exception exception)
    {
        var stream = Interlocked.Exchange(ref _stream, null);
        if (stream is not null) await stream.DisposeAsync().ConfigureAwait(false);
        foreach (var pending in _pending.ToArray())
            if (_pending.TryRemove(pending.Key, out var completion)) completion.TrySetException(exception);
    }

    public async ValueTask DisposeAsync()
    {
        await _lifetime.CancelAsync().ConfigureAwait(false);
        await ResetAsync(new ObjectDisposedException(nameof(DotReactFramedRendererConnection))).ConfigureAwait(false);
        if (_reader is not null)
        {
            try { await _reader.ConfigureAwait(false); }
            catch (OperationCanceledException) { }
        }
        _lifetime.Dispose();
        _connectionLock.Dispose();
        _writeLock.Dispose();
        _inFlight.Dispose();
    }
}
