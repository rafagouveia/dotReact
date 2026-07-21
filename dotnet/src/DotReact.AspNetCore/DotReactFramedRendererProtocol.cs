using System.Buffers.Binary;
using System.Text;

namespace DotReact.AspNetCore;

internal enum DotReactRendererFrameKind : byte
{
    Authenticate = 1,
    AuthenticationAccepted = 2,
    RenderRequest = 3,
    RenderResponse = 4
}

internal readonly record struct DotReactRendererFrame(
    DotReactRendererFrameKind Kind,
    string CorrelationId,
    ReadOnlyMemory<byte> Payload);

internal static class DotReactFramedRendererProtocol
{
    internal const int HeaderLength = 16;
    internal const int MaximumFrameBytes = 32 * 1024 * 1024;
    private static ReadOnlySpan<byte> Magic => "DRF2"u8;

    internal static byte[] Encode(
        DotReactRendererFrameKind kind,
        string correlationId,
        ReadOnlySpan<byte> token,
        ReadOnlySpan<byte> payload)
    {
        var correlation = Encoding.UTF8.GetBytes(correlationId);
        if (correlation.Length > ushort.MaxValue || token.Length > ushort.MaxValue)
            throw new DotReactRendererException("Renderer frame metadata exceeds the supported length.");
        var length = checked(HeaderLength + correlation.Length + token.Length + payload.Length);
        if (length > MaximumFrameBytes)
            throw new DotReactRendererException("Renderer frame exceeds the supported length.");
        var output = GC.AllocateUninitializedArray<byte>(length);
        Magic.CopyTo(output);
        output[4] = 1;
        output[5] = (byte)kind;
        output[6] = 0;
        output[7] = 0;
        BinaryPrimitives.WriteUInt16BigEndian(output.AsSpan(8), checked((ushort)correlation.Length));
        BinaryPrimitives.WriteUInt16BigEndian(output.AsSpan(10), checked((ushort)token.Length));
        BinaryPrimitives.WriteUInt32BigEndian(output.AsSpan(12), checked((uint)payload.Length));
        var offset = HeaderLength;
        correlation.CopyTo(output, offset); offset += correlation.Length;
        token.CopyTo(output.AsSpan(offset)); offset += token.Length;
        payload.CopyTo(output.AsSpan(offset));
        return output;
    }

    internal static async ValueTask<DotReactRendererFrame?> ReadAsync(
        Stream stream,
        CancellationToken cancellationToken)
    {
        var header = new byte[HeaderLength];
        var headerRead = await ReadExactlyOrEofAsync(stream, header, cancellationToken).ConfigureAwait(false);
        if (!headerRead) return null;
        if (!header.AsSpan(0, 4).SequenceEqual(Magic) || header[4] != 1)
            throw new DotReactRendererException("Renderer returned an invalid frame header.");
        var kind = (DotReactRendererFrameKind)header[5];
        if (kind is < DotReactRendererFrameKind.Authenticate or > DotReactRendererFrameKind.RenderResponse)
            throw new DotReactRendererException("Renderer returned an unknown frame kind.");
        var correlationLength = BinaryPrimitives.ReadUInt16BigEndian(header.AsSpan(8));
        var tokenLength = BinaryPrimitives.ReadUInt16BigEndian(header.AsSpan(10));
        var payloadLengthValue = BinaryPrimitives.ReadUInt32BigEndian(header.AsSpan(12));
        if (payloadLengthValue > MaximumFrameBytes)
            throw new DotReactRendererException("Renderer frame payload exceeds the supported length.");
        var payloadLength = checked((int)payloadLengthValue);
        var bodyLength = checked(correlationLength + tokenLength + payloadLength);
        if (HeaderLength + bodyLength > MaximumFrameBytes)
            throw new DotReactRendererException("Renderer frame exceeds the supported length.");
        var body = GC.AllocateUninitializedArray<byte>(bodyLength);
        await stream.ReadExactlyAsync(body, cancellationToken).ConfigureAwait(false);
        var correlation = Encoding.UTF8.GetString(body, 0, correlationLength);
        var payloadOffset = correlationLength + tokenLength;
        return new DotReactRendererFrame(kind, correlation, body.AsMemory(payloadOffset, payloadLength));
    }

    private static async ValueTask<bool> ReadExactlyOrEofAsync(
        Stream stream,
        Memory<byte> destination,
        CancellationToken cancellationToken)
    {
        var offset = 0;
        while (offset < destination.Length)
        {
            var read = await stream.ReadAsync(destination[offset..], cancellationToken).ConfigureAwait(false);
            if (read == 0)
            {
                if (offset == 0) return false;
                throw new EndOfStreamException("Renderer closed a partial frame.");
            }
            offset += read;
        }
        return true;
    }
}
