using System.Text;
using DotReact.AspNetCore;
using Xunit;

namespace DotReact.AspNetCore.Tests;

public sealed class DotReactFramedRendererProtocolTests
{
    [Fact]
    public async Task FrameRoundTripPreservesCorrelationTokenAndPayload()
    {
        var encoded = DotReactFramedRendererProtocol.Encode(
            DotReactRendererFrameKind.RenderRequest,
            "correlation-ç",
            "token"u8,
            "conteúdo"u8);
        await using var stream = new MemoryStream(encoded);

        var frame = await DotReactFramedRendererProtocol.ReadAsync(stream, CancellationToken.None);

        Assert.NotNull(frame);
        Assert.Equal(DotReactRendererFrameKind.RenderRequest, frame.Value.Kind);
        Assert.Equal("correlation-ç", frame.Value.CorrelationId);
        Assert.Equal("conteúdo", Encoding.UTF8.GetString(frame.Value.Payload.Span));
    }

    [Fact]
    public async Task ProtocolRejectsInvalidHeader()
    {
        await using var stream = new MemoryStream(new byte[DotReactFramedRendererProtocol.HeaderLength]);
        await Assert.ThrowsAsync<DotReactRendererException>(async () =>
            await DotReactFramedRendererProtocol.ReadAsync(stream, CancellationToken.None));
    }
}
