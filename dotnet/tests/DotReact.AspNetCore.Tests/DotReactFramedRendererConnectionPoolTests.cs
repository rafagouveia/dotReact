using System.Buffers.Binary;
using System.IO.Pipes;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using DotReact.AspNetCore;
using Microsoft.Extensions.Options;
using Xunit;

namespace DotReact.AspNetCore.Tests;

public sealed class DotReactFramedRendererConnectionPoolTests
{
    [Fact]
    public async Task PoolReconnectsAndRetriesAfterAChannelCloses()
    {
        var endpoint = DotReactRendererInterprocessEndpoint.CreateDefault($"test-{Guid.NewGuid():N}"[..13]);
        var ready = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var server = RunServerAsync(endpoint, ready.SetResult);
        await ready.Task;
        var options = Options.Create(new DotReactOptions
        {
            RendererFrameSocketPath = endpoint,
            RendererToken = new string('t', 48),
            RendererFrameConnectionCount = 1,
            RendererFrameMaxInFlightPerConnection = 4,
            RendererRetryCount = 1,
            RendererRetryDelay = TimeSpan.Zero,
            RendererConnectTimeout = TimeSpan.FromSeconds(2),
            RequestTimeout = TimeSpan.FromSeconds(2),
            UseBinaryRendererTransport = true,
            UseFramedRendererTransport = true
        });
        await using var pool = new DotReactFramedRendererConnectionPool(options);
        using var props = JsonDocument.Parse("""{"message":"ok"}""");

        var response = await pool.RenderAsync(new DotReactRenderRequest(
            1, "retry-request", "app/page.drx", "/", props.RootElement.Clone(), "ssr"),
            CancellationToken.None);

        Assert.True(response.Ok);
        Assert.Equal("<main>reconnected</main>", response.Html);
        await server;
    }

    private static async Task RunServerAsync(string endpoint, Action markReady)
    {
        if (OperatingSystem.IsWindows())
        {
            var name = endpoint[@"\\.\pipe\".Length..];
            for (var attempt = 0; attempt < 2; attempt++)
            {
                await using var pipe = new NamedPipeServerStream(name, PipeDirection.InOut, 1,
                    PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
                if (attempt == 0) markReady();
                await pipe.WaitForConnectionAsync();
                await HandleConnectionAsync(pipe, respond: attempt == 1);
            }
            return;
        }

        if (File.Exists(endpoint)) File.Delete(endpoint);
        using var listener = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
        listener.Bind(new UnixDomainSocketEndPoint(endpoint));
        listener.Listen(2);
        markReady();
        try
        {
            for (var attempt = 0; attempt < 2; attempt++)
            {
                using var accepted = await listener.AcceptAsync();
                await using var stream = new NetworkStream(accepted, ownsSocket: false);
                await HandleConnectionAsync(stream, respond: attempt == 1);
            }
        }
        finally { if (File.Exists(endpoint)) File.Delete(endpoint); }
    }

    private static async Task HandleConnectionAsync(Stream stream, bool respond)
    {
        var authentication = await DotReactFramedRendererProtocol.ReadAsync(stream, CancellationToken.None);
        Assert.Equal(DotReactRendererFrameKind.Authenticate, authentication?.Kind);
        var accepted = DotReactFramedRendererProtocol.Encode(
            DotReactRendererFrameKind.AuthenticationAccepted, string.Empty, [], []);
        await stream.WriteAsync(accepted);
        await stream.FlushAsync();
        var request = await DotReactFramedRendererProtocol.ReadAsync(stream, CancellationToken.None);
        Assert.Equal(DotReactRendererFrameKind.RenderRequest, request?.Kind);
        if (!respond) return;
        var payload = SuccessResponse("retry-request", "<main>reconnected</main>");
        var response = DotReactFramedRendererProtocol.Encode(
            DotReactRendererFrameKind.RenderResponse, request!.Value.CorrelationId, [], payload);
        await stream.WriteAsync(response);
        await stream.FlushAsync();
    }

    private static byte[] SuccessResponse(string requestId, string html)
    {
        var id = Encoding.UTF8.GetBytes(requestId);
        var markup = Encoding.UTF8.GetBytes(html);
        var head = "[]"u8.ToArray();
        var output = new byte[20 + id.Length + markup.Length + head.Length];
        "DTR2"u8.CopyTo(output);
        output[4] = 1;
        BinaryPrimitives.WriteUInt32BigEndian(output.AsSpan(8), (uint)id.Length);
        BinaryPrimitives.WriteUInt32BigEndian(output.AsSpan(12), (uint)markup.Length);
        BinaryPrimitives.WriteUInt32BigEndian(output.AsSpan(16), (uint)head.Length);
        var offset = 20;
        id.CopyTo(output, offset); offset += id.Length;
        markup.CopyTo(output, offset); offset += markup.Length;
        head.CopyTo(output, offset);
        return output;
    }
}
