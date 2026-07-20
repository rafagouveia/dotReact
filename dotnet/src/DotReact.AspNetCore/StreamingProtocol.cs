using System.Text.Json;
using System.Text.Json.Serialization;

namespace DotReact.AspNetCore;

/// <summary>Constants for the versioned DotReact streaming renderer transport.</summary>
public static class DotReactStreamingProtocol
{
    /// <summary>Current streaming transport protocol version.</summary>
    public const int Version = 2;
    /// <summary>Request and response header carrying the streaming protocol version.</summary>
    public const string VersionHeader = "X-DotReact-Protocol-Version";
    /// <summary>Versioned JSON Lines media type used by the loopback stream.</summary>
    public const string MediaType = "application/vnd.dotreact.render-stream+jsonl;v=2";

    /// <summary>Checks the bounded base64/base64url nonce accepted by the streaming wire contract.</summary>
    public static bool IsSafeNonce(string? nonce) => nonce is null
        || nonce.Length is >= 16 and <= 256
        && nonce.TakeWhile(character => char.IsAsciiLetterOrDigit(character)
            || character is '+' or '/' or '_' or '-').Count() is var contentLength
        && contentLength > 0
        && nonce[contentLength..].Length is <= 2
        && nonce[contentLength..].All(character => character == '=');
}

/// <summary>The v2 request sent by ASP.NET Core to a streaming renderer entry.</summary>
public sealed record DotReactRenderStreamRequest(
    [property: JsonPropertyName("protocolVersion")] int ProtocolVersion,
    [property: JsonPropertyName("requestId")] string RequestId,
    [property: JsonPropertyName("moduleId")] string ModuleId,
    [property: JsonPropertyName("url")] string Url,
    [property: JsonPropertyName("props")] JsonElement Props,
    [property: JsonPropertyName("renderMode")] string RenderMode,
    [property: JsonPropertyName("responseKind")] string ResponseKind,
    [property: JsonPropertyName("capabilities")] IReadOnlyList<string> Capabilities,
    [property: JsonPropertyName("boundaryKind")] string? BoundaryKind = null,
    [property: JsonPropertyName("nonce")] string? Nonce = null);

/// <summary>Base type for one correlated frame in a v2 renderer stream.</summary>
public abstract record DotReactRenderStreamFrame(int ProtocolVersion, string RequestId, string Kind);

/// <summary>Starts a stream and supplies safely structured document head elements.</summary>
public sealed record DotReactRenderStreamStartFrame(
    int ProtocolVersion,
    string RequestId,
    IReadOnlyList<DotReactHeadElement> Head)
    : DotReactRenderStreamFrame(ProtocolVersion, RequestId, "start");

/// <summary>Contains one ordered UTF-8 HTML chunk.</summary>
public sealed record DotReactRenderStreamHtmlFrame(
    int ProtocolVersion,
    string RequestId,
    int Sequence,
    string Chunk)
    : DotReactRenderStreamFrame(ProtocolVersion, RequestId, "html");

/// <summary>Contains one ordered base64-encoded React Flight chunk.</summary>
public sealed record DotReactRenderStreamFlightFrame(
    int ProtocolVersion,
    string RequestId,
    int Sequence,
    string Data)
    : DotReactRenderStreamFrame(ProtocolVersion, RequestId, "flight");

/// <summary>Completes a renderer stream successfully.</summary>
public sealed record DotReactRenderStreamCompleteFrame(
    int ProtocolVersion,
    string RequestId,
    IReadOnlyDictionary<string, double>? Metrics)
    : DotReactRenderStreamFrame(ProtocolVersion, RequestId, "complete");

/// <summary>Terminates a renderer stream with a structured failure.</summary>
public sealed record DotReactRenderStreamErrorFrame(
    int ProtocolVersion,
    string RequestId,
    string Phase,
    string Code,
    string Message)
    : DotReactRenderStreamFrame(ProtocolVersion, RequestId, "error");

/// <summary>Streams validated renderer frames without buffering the complete HTML document.</summary>
public interface IDotReactStreamingRenderer
{
    /// <summary>Starts one loopback renderer stream.</summary>
    IAsyncEnumerable<DotReactRenderStreamFrame> RenderStreamAsync(
        DotReactRenderStreamRequest request,
        CancellationToken cancellationToken);
}
