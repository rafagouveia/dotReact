using System.Net.Http.Json;
using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace DotReact.AspNetCore;

internal sealed class DotReactRendererClient(
    HttpClient httpClient,
    IOptions<DotReactOptions> options) : IDotReactRenderer
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
        using var message = new HttpRequestMessage(HttpMethod.Post, "__dotreact/render")
        {
            Content = JsonContent.Create(request, options: JsonOptions)
        };

        AddAuthorization(message);

        using var response = await httpClient.SendAsync(
            message,
            HttpCompletionOption.ResponseHeadersRead,
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

    private void AddAuthorization(HttpRequestMessage message)
    {
        if (!string.IsNullOrWhiteSpace(_options.RendererToken))
            message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.RendererToken);
    }
}
