using System.Buffers.Binary;
using System.Text;
using System.Text.Json;

namespace DotReact.AspNetCore;

/// <summary>Allocation-conscious framing for buffered renders over a persistent HTTP connection.</summary>
internal static class DotReactBinaryRendererCodec
{
    internal const string MediaType = "application/vnd.dotreact.render+binary;v=2";
    private static ReadOnlySpan<byte> Magic => "DTR2"u8;
    private const int RequestHeaderBytes = 24;
    private const int ResponseHeaderBytes = 20;

    internal static byte[] EncodeRequest(DotReactRenderRequest request, JsonSerializerOptions options)
    {
        ReadOnlyMemory<byte> props = request.SerializedProps.IsEmpty
            ? JsonSerializer.SerializeToUtf8Bytes(request.Props, options)
            : request.SerializedProps;
        var requestId = Encoding.UTF8.GetBytes(request.RequestId);
        var moduleId = Encoding.UTF8.GetBytes(request.ModuleId);
        var url = Encoding.UTF8.GetBytes(request.Url);
        var output = GC.AllocateUninitializedArray<byte>(checked(RequestHeaderBytes
            + props.Length + requestId.Length + moduleId.Length + url.Length));
        Magic.CopyTo(output);
        output[4] = 1;
        output[5] = request.BoundaryKind switch
        {
            null => 0,
            "not-found" => 1,
            "error" => 2,
            _ => throw new DotReactRendererException("Unsupported renderer boundary kind.")
        };
        BinaryPrimitives.WriteUInt32BigEndian(output.AsSpan(8), checked((uint)props.Length));
        BinaryPrimitives.WriteUInt32BigEndian(output.AsSpan(12), checked((uint)requestId.Length));
        BinaryPrimitives.WriteUInt32BigEndian(output.AsSpan(16), checked((uint)moduleId.Length));
        BinaryPrimitives.WriteUInt32BigEndian(output.AsSpan(20), checked((uint)url.Length));
        var offset = RequestHeaderBytes;
        props.Span.CopyTo(output.AsSpan(offset)); offset += props.Length;
        requestId.CopyTo(output, offset); offset += requestId.Length;
        moduleId.CopyTo(output, offset); offset += moduleId.Length;
        url.CopyTo(output, offset);
        return output;
    }

    internal static DotReactRenderResponse DecodeResponse(
        ReadOnlySpan<byte> body,
        string expectedRequestId,
        JsonSerializerOptions options)
    {
        if (body.Length < ResponseHeaderBytes || !body[..4].SequenceEqual(Magic))
            throw new DotReactRendererException("Renderer returned an invalid binary response header.");
        var kind = body[4];
        if (kind is not 1 and not 2)
            throw new DotReactRendererException("Renderer returned an unknown binary response kind.");
        var requestIdLength = ReadLength(body, 8);
        var htmlLength = ReadLength(body, 12);
        var metadataLength = ReadLength(body, 16);
        if ((long)ResponseHeaderBytes + requestIdLength + htmlLength + metadataLength != body.Length)
            throw new DotReactRendererException("Renderer returned an invalid binary response length.");
        var offset = ResponseHeaderBytes;
        var requestId = Encoding.UTF8.GetString(body.Slice(offset, requestIdLength)); offset += requestIdLength;
        if (!string.Equals(requestId, expectedRequestId, StringComparison.Ordinal))
            throw new DotReactRendererException(
                $"Renderer response requestId '{requestId}' did not match '{expectedRequestId}'.");
        if (kind == 2)
        {
            offset += htmlLength;
            var message = ReadFailureMessage(body.Slice(offset, metadataLength));
            throw new DotReactRendererException($"Renderer failed: {message}");
        }
        var html = Encoding.UTF8.GetString(body.Slice(offset, htmlLength)); offset += htmlLength;
        var head = JsonSerializer.Deserialize<IReadOnlyList<DotReactHeadElement>>(
            body.Slice(offset, metadataLength), options)
            ?? throw new DotReactRendererException("Renderer returned empty head metadata.");
        return new DotReactRenderResponse
        {
            ProtocolVersion = 1,
            RequestId = requestId,
            Ok = true,
            Html = html,
            Head = head
        };
    }

    private static int ReadLength(ReadOnlySpan<byte> body, int offset)
    {
        var value = BinaryPrimitives.ReadUInt32BigEndian(body.Slice(offset, 4));
        return value > int.MaxValue
            ? throw new DotReactRendererException("Renderer response field exceeds the supported length.")
            : (int)value;
    }

    private static string ReadFailureMessage(ReadOnlySpan<byte> metadata)
    {
        try
        {
            var element = JsonSerializer.Deserialize<JsonElement>(metadata);
            return element.TryGetProperty("message", out var message)
                ? message.GetString() ?? "Unknown renderer error."
                : "Unknown renderer error.";
        }
        catch (JsonException)
        {
            return "Malformed renderer error.";
        }
    }
}
