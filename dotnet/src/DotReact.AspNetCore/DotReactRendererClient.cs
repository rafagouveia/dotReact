using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;

namespace DotReact.AspNetCore;

internal sealed class DotReactRendererClient(
    HttpClient httpClient,
    IOptions<DotReactOptions> options,
    DotReactFramedRendererConnectionPool framedRenderer) : IDotReactRenderer
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly DotReactOptions _options = options.Value;

    public async Task<HealthCheckResult> CheckHealthAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var message = new HttpRequestMessage(HttpMethod.Get, "__dotreact/ready");
            AddAuthorization(message);
            using var response = await httpClient.SendAsync(message, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
                .ConfigureAwait(false);
            return response.IsSuccessStatusCode
                ? HealthCheckResult.Healthy()
                : HealthCheckResult.Unhealthy($"Renderer readiness returned HTTP {(int)response.StatusCode}.");
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
        {
            return HealthCheckResult.Unhealthy("Renderer readiness request failed.");
        }
    }

    public async Task<DotReactRenderResponse> RenderAsync(
        DotReactRenderRequest request,
        CancellationToken cancellationToken)
    {
        if (_options.UseFramedRendererTransport)
            return await framedRenderer.RenderAsync(request, cancellationToken).ConfigureAwait(false);

        if (_options.UseBinaryRendererTransport)
            return await RenderBinaryAsync(request, cancellationToken).ConfigureAwait(false);

        using var response = await DotReactRendererTransport.SendAsync(
            httpClient,
            () => CreateRenderRequest(request),
            HttpCompletionOption.ResponseHeadersRead,
            _options,
            cancellationToken).ConfigureAwait(false);

        try
        {
            var result = await response.Content.ReadFromJsonAsync<DotReactRenderResponse>(JsonOptions, cancellationToken)
                .ConfigureAwait(false)
                ?? throw new DotReactRendererException("Renderer returned an empty response.");

            if (!response.IsSuccessStatusCode || !result.Ok)
            {
                throw new DotReactRendererException(
                    $"Renderer returned HTTP {(int)response.StatusCode} ({response.ReasonPhrase}).");
            }

            if (result.ProtocolVersion != 1)
            {
                throw new DotReactRendererException(
                    $"Renderer protocol mismatch: expected 1, received {result.ProtocolVersion}.");
            }

            if (!string.Equals(result.RequestId, request.RequestId, StringComparison.Ordinal))
            {
                throw new DotReactRendererException("Renderer response requestId did not match the request.");
            }

            return result;
        }
        catch (JsonException exception)
        {
            throw new DotReactRendererException("Renderer returned invalid JSON.", exception);
        }
    }

    private async Task<DotReactRenderResponse> RenderBinaryAsync(
        DotReactRenderRequest request,
        CancellationToken cancellationToken)
    {
        using var response = await DotReactRendererTransport.SendAsync(
            httpClient,
            () => CreateBinaryRenderRequest(request),
            HttpCompletionOption.ResponseHeadersRead,
            _options,
            cancellationToken).ConfigureAwait(false);
        const int maximumResponseBytes = 32 * 1024 * 1024;
        if (response.Content.Headers.ContentLength is > maximumResponseBytes)
            throw new DotReactRendererException("Renderer response exceeds the supported length.");
        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        using var content = new MemoryStream(response.Content.Headers.ContentLength is > 0 and <= maximumResponseBytes
            ? (int)response.Content.Headers.ContentLength.Value : 16 * 1024);
        var buffer = new byte[16 * 1024];
        while (true)
        {
            var read = await stream.ReadAsync(buffer, cancellationToken).ConfigureAwait(false);
            if (read == 0) break;
            if (content.Length + read > maximumResponseBytes)
                throw new DotReactRendererException("Renderer response exceeds the supported length.");
            content.Write(buffer, 0, read);
        }
        return DotReactBinaryRendererCodec.DecodeResponse(content.GetBuffer().AsSpan(0, checked((int)content.Length)), request.RequestId, JsonOptions);
    }

    private HttpRequestMessage CreateRenderRequest(DotReactRenderRequest request)
    {
        var message = new HttpRequestMessage(HttpMethod.Post, "__dotreact/render")
        {
            Content = JsonContent.Create(request, options: JsonOptions)
        };
        AddAuthorization(message);
        return message;
    }

    private HttpRequestMessage CreateBinaryRenderRequest(DotReactRenderRequest request)
    {
        var content = new ByteArrayContent(DotReactBinaryRendererCodec.EncodeRequest(request, JsonOptions));
        content.Headers.ContentType = MediaTypeHeaderValue.Parse(DotReactBinaryRendererCodec.MediaType);
        var message = new HttpRequestMessage(HttpMethod.Post, "__dotreact/render-v2") { Content = content };
        AddAuthorization(message);
        return message;
    }

    private void AddAuthorization(HttpRequestMessage message)
    {
        if (!string.IsNullOrWhiteSpace(_options.RendererToken))
            message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.RendererToken);
    }
}
