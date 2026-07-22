using System.Text.Json;
using DotReact.AspNetCore;
using Xunit;

namespace DotReact.AspNetCore.Tests;

public sealed class DotReactBinaryRendererCodecTests
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    public void RequestCodecPreservesUtf8PropsAndRouteFields()
    {
        using var props = JsonDocument.Parse("""{"total":42,"label":"Conciliação"}""");
        var encoded = DotReactBinaryRendererCodec.EncodeRequest(new DotReactRenderRequest(
            1, "request-1", "app/relatório/page", "/relatório?mês=7", props.RootElement.Clone(), "ssr"), JsonOptions);

        Assert.Equal("DTR2", System.Text.Encoding.ASCII.GetString(encoded, 0, 4));
        Assert.Contains("Concilia\\u00E7\\u00E3o", System.Text.Encoding.UTF8.GetString(encoded), StringComparison.Ordinal);
    }

    [Fact]
    public void ResponseCodecRejectsMismatchedRequestId()
    {
        var response = CreateSuccessResponse("other", "<main>ok</main>");
        var exception = Assert.Throws<DotReactRendererException>(() =>
            DotReactBinaryRendererCodec.DecodeResponse(response, "expected", JsonOptions));
        Assert.Contains("requestId", exception.Message, StringComparison.Ordinal);
    }

    private static byte[] CreateSuccessResponse(string requestId, string html)
    {
        var id = System.Text.Encoding.UTF8.GetBytes(requestId);
        var markup = System.Text.Encoding.UTF8.GetBytes(html);
        var head = System.Text.Encoding.UTF8.GetBytes("[]");
        var output = new byte[20 + id.Length + markup.Length + head.Length];
        "DTR2"u8.CopyTo(output);
        output[4] = 1;
        System.Buffers.Binary.BinaryPrimitives.WriteUInt32BigEndian(output.AsSpan(8), (uint)id.Length);
        System.Buffers.Binary.BinaryPrimitives.WriteUInt32BigEndian(output.AsSpan(12), (uint)markup.Length);
        System.Buffers.Binary.BinaryPrimitives.WriteUInt32BigEndian(output.AsSpan(16), (uint)head.Length);
        var offset = 20;
        id.CopyTo(output, offset); offset += id.Length;
        markup.CopyTo(output, offset); offset += markup.Length;
        head.CopyTo(output, offset);
        return output;
    }
}
