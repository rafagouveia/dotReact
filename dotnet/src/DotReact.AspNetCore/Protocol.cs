using System.Text.Json;
using System.Text.Json.Serialization;

namespace DotReact.AspNetCore;

/// <summary>The v1 request sent by the ASP.NET Core host to the renderer.</summary>
public sealed record DotReactRenderRequest(
    [property: JsonPropertyName("protocolVersion")] int ProtocolVersion,
    [property: JsonPropertyName("requestId")] string RequestId,
    [property: JsonPropertyName("moduleId")] string ModuleId,
    [property: JsonPropertyName("url")] string Url,
    [property: JsonPropertyName("props")] JsonElement Props,
    [property: JsonPropertyName("renderMode")] string RenderMode,
    [property: JsonPropertyName("boundaryKind")] string? BoundaryKind = null)
{
    /// <summary>Framework-owned UTF-8 props reused by hashing and the managed binary transport.</summary>
    [JsonIgnore]
    internal ReadOnlyMemory<byte> SerializedProps { get; init; }
}

/// <summary>A structured, safely serialized element for the document head.</summary>
public sealed record DotReactHeadElement
{
    /// <summary>Element kind: title, meta, link, or script.</summary>
    public string Kind { get; init; } = string.Empty;

    /// <summary>Text content used by title elements.</summary>
    public string? Content { get; init; }

    /// <summary>Attributes used by meta and link elements.</summary>
    public IReadOnlyDictionary<string, string>? Attrs { get; init; }
}

/// <summary>The v1 response returned by the renderer.</summary>
public sealed record DotReactRenderResponse
{
    /// <summary>Renderer protocol version.</summary>
    public int ProtocolVersion { get; init; }

    /// <summary>Identifier of the corresponding render request.</summary>
    public string RequestId { get; init; } = string.Empty;

    /// <summary>Indicates that rendering completed successfully.</summary>
    public bool Ok { get; init; }

    /// <summary>Rendered markup placed inside the application root.</summary>
    public string Html { get; init; } = string.Empty;

    /// <summary>Structured elements appended safely to the document head.</summary>
    public IReadOnlyList<DotReactHeadElement> Head { get; init; } = [];
}

/// <summary>Abstraction over the DotReact renderer transport.</summary>
public interface IDotReactRenderer
{
    /// <summary>Renders one React page.</summary>
    Task<DotReactRenderResponse> RenderAsync(DotReactRenderRequest request, CancellationToken cancellationToken);
}
