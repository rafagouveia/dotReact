using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace DotReact.AspNetCore;

internal sealed class DotReactStreamingRendererClient(
    HttpClient httpClient,
    IOptions<DotReactOptions> options) : IDotReactStreamingRenderer
{
    private const int MaxFrameBytes = 1024 * 1024;
    private const int MaxTotalBytes = 32 * 1024 * 1024;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly DotReactOptions _options = options.Value;

    public async IAsyncEnumerable<DotReactRenderStreamFrame> RenderStreamAsync(
        DotReactRenderStreamRequest request,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);
        if (request.ProtocolVersion != DotReactStreamingProtocol.Version)
            throw new ArgumentException(
                $"Streaming requests must use protocol {DotReactStreamingProtocol.Version}.", nameof(request));
        if (!DotReactStreamingProtocol.IsSafeNonce(request.Nonce))
            throw new ArgumentException("Streaming CSP nonces must be bounded base64 or base64url values.", nameof(request));

        using var response = await DotReactRendererTransport.SendAsync(
            httpClient,
            () => CreateRenderRequest(request),
            HttpCompletionOption.ResponseHeadersRead,
            _options,
            cancellationToken).ConfigureAwait(false);

        ValidateResponseHeaders(response);
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        var state = new StreamState(request.RequestId);
        await foreach (var line in ReadBoundedLinesAsync(stream, cancellationToken).ConfigureAwait(false))
        {
            DotReactRenderStreamFrame frame;
            try
            {
                frame = ParseFrame(line, request.RequestId);
                state.Validate(frame);
            }
            catch (JsonException exception)
            {
                throw new DotReactRendererException("Renderer returned an invalid v2 stream frame.", exception);
            }
            yield return frame;
        }

        if (!state.Terminal)
            throw new DotReactRendererException("Renderer stream ended without a terminal frame.");
    }

    private HttpRequestMessage CreateRenderRequest(DotReactRenderStreamRequest request)
    {
        var message = new HttpRequestMessage(HttpMethod.Post, "__dotreact/render-stream")
        {
            Content = JsonContent.Create(request, options: JsonOptions)
        };
        message.Headers.Accept.ParseAdd(DotReactStreamingProtocol.MediaType);
        message.Headers.TryAddWithoutValidation(
            DotReactStreamingProtocol.VersionHeader,
            DotReactStreamingProtocol.Version.ToString(System.Globalization.CultureInfo.InvariantCulture));
        if (!string.IsNullOrWhiteSpace(_options.RendererToken))
            message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.RendererToken);
        return message;
    }

    private static void ValidateResponseHeaders(HttpResponseMessage response)
    {
        if (!response.IsSuccessStatusCode)
            throw new DotReactRendererException(
                $"Streaming renderer returned HTTP {(int)response.StatusCode} ({response.ReasonPhrase}).");

        if (!response.Headers.TryGetValues(DotReactStreamingProtocol.VersionHeader, out var versions)
            || versions.Count() != 1
            || versions.Single() != DotReactStreamingProtocol.Version.ToString(System.Globalization.CultureInfo.InvariantCulture))
            throw new DotReactRendererException("Streaming renderer protocol response header was missing or incompatible.");

        var contentType = response.Content.Headers.ContentType;
        if (contentType is null
            || !string.Equals(contentType.MediaType, "application/vnd.dotreact.render-stream+jsonl", StringComparison.OrdinalIgnoreCase)
            || contentType.Parameters.Count != 1
            || !string.Equals(contentType.Parameters.Single().Name, "v", StringComparison.OrdinalIgnoreCase)
            || !string.Equals(contentType.Parameters.Single().Value?.Trim('"'), "2", StringComparison.Ordinal))
            throw new DotReactRendererException("Streaming renderer returned an incompatible content type.");
    }

    private static async IAsyncEnumerable<byte[]> ReadBoundedLinesAsync(
        Stream stream,
        [EnumeratorCancellation] CancellationToken cancellationToken)
    {
        var readBuffer = new byte[8192];
        using var line = new MemoryStream();
        var total = 0;
        while (true)
        {
            var read = await stream.ReadAsync(readBuffer, cancellationToken).ConfigureAwait(false);
            if (read == 0) break;
            total += read;
            if (total > MaxTotalBytes)
                throw new DotReactRendererException("Renderer stream exceeds the configured total response limit.");
            for (var index = 0; index < read; index++)
            {
                var current = readBuffer[index];
                if (current == (byte)'\n')
                {
                    if (line.Length == 0)
                        throw new DotReactRendererException("Renderer stream contained an empty frame.");
                    yield return line.ToArray();
                    line.SetLength(0);
                    continue;
                }
                if (line.Length >= MaxFrameBytes)
                    throw new DotReactRendererException("Renderer stream frame exceeds the configured limit.");
                line.WriteByte(current);
            }
        }
        if (line.Length != 0)
            throw new DotReactRendererException("Renderer stream ended with an incomplete frame.");
    }

    private static DotReactRenderStreamFrame ParseFrame(byte[] line, string requestId)
    {
        using var document = JsonDocument.Parse(line);
        var root = document.RootElement;
        if (root.ValueKind != JsonValueKind.Object
            || RequiredInt32(root, "protocolVersion") != DotReactStreamingProtocol.Version
            || !string.Equals(RequiredString(root, "requestId"), requestId, StringComparison.Ordinal))
            throw new JsonException("Uncorrelated or incompatible renderer frame.");

        var kind = RequiredString(root, "kind");
        return kind switch
        {
            "start" => new DotReactRenderStreamStartFrame(
                DotReactStreamingProtocol.Version,
                requestId,
                root.GetProperty("head").Deserialize<IReadOnlyList<DotReactHeadElement>>(JsonOptions)
                    ?? throw new JsonException("Start frame head is required.")),
            "html" => new DotReactRenderStreamHtmlFrame(
                DotReactStreamingProtocol.Version, requestId,
                RequiredInt32(root, "sequence"), RequiredString(root, "chunk")),
            "flight" => new DotReactRenderStreamFlightFrame(
                DotReactStreamingProtocol.Version, requestId,
                RequiredInt32(root, "sequence"), RequiredString(root, "data")),
            "complete" => new DotReactRenderStreamCompleteFrame(
                DotReactStreamingProtocol.Version, requestId, ReadMetrics(root)),
            "error" => new DotReactRenderStreamErrorFrame(
                DotReactStreamingProtocol.Version, requestId,
                RequiredString(root, "phase"), RequiredString(root, "code"), RequiredString(root, "message")),
            _ => throw new JsonException("Unknown renderer stream frame kind.")
        };
    }

    private static IReadOnlyDictionary<string, double>? ReadMetrics(JsonElement root)
    {
        if (!root.TryGetProperty("metrics", out var value)) return null;
        var metrics = value.Deserialize<Dictionary<string, double>>(JsonOptions)
            ?? throw new JsonException("Complete frame metrics must be an object.");
        if (metrics.Any(pair => string.IsNullOrWhiteSpace(pair.Key)
            || !double.IsFinite(pair.Value) || pair.Value < 0))
            throw new JsonException("Complete frame metrics must be finite and non-negative.");
        return metrics;
    }

    private static string RequiredString(JsonElement root, string name)
    {
        var value = root.GetProperty(name);
        return value.ValueKind == JsonValueKind.String
            ? value.GetString()!
            : throw new JsonException($"Renderer frame property '{name}' must be a string.");
    }

    private static int RequiredInt32(JsonElement root, string name) =>
        root.GetProperty(name).TryGetInt32(out var value) && value >= 0
            ? value
            : throw new JsonException($"Renderer frame property '{name}' must be a non-negative integer.");

    private sealed class StreamState(string requestId)
    {
        private int _nextHtmlSequence;
        private int _nextFlightSequence;
        private bool _started;
        public bool Terminal { get; private set; }

        public void Validate(DotReactRenderStreamFrame frame)
        {
            if (!string.Equals(frame.RequestId, requestId, StringComparison.Ordinal)
                || frame.ProtocolVersion != DotReactStreamingProtocol.Version || Terminal)
                throw new DotReactRendererException("Renderer returned an invalid stream sequence.");
            switch (frame)
            {
                case DotReactRenderStreamStartFrame:
                    if (_started) throw new DotReactRendererException("Renderer returned more than one start frame.");
                    _started = true;
                    break;
                case DotReactRenderStreamHtmlFrame html:
                    if (!_started || html.Sequence != _nextHtmlSequence++)
                        throw new DotReactRendererException("Renderer returned an out-of-order HTML frame.");
                    break;
                case DotReactRenderStreamFlightFrame flight:
                    if (!_started || flight.Sequence != _nextFlightSequence++)
                        throw new DotReactRendererException("Renderer returned an out-of-order Flight frame.");
                    break;
                case DotReactRenderStreamCompleteFrame:
                    if (!_started) throw new DotReactRendererException("Renderer completed before its start frame.");
                    Terminal = true;
                    break;
                case DotReactRenderStreamErrorFrame error:
                    if (error.Phase is not ("before-shell" or "after-shell"))
                        throw new DotReactRendererException("Renderer returned an invalid error phase.");
                    Terminal = true;
                    break;
                default:
                    throw new DotReactRendererException("Renderer returned an unsupported stream frame.");
            }
        }
    }
}
