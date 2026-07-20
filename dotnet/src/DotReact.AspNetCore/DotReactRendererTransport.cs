namespace DotReact.AspNetCore;

/// <summary>Executes renderer transport requests with a bounded retry policy.</summary>
internal static class DotReactRendererTransport
{
    public static async Task<HttpResponseMessage> SendAsync(
        HttpClient client,
        Func<HttpRequestMessage> createRequest,
        HttpCompletionOption completionOption,
        DotReactOptions options,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(client);
        ArgumentNullException.ThrowIfNull(createRequest);
        ArgumentNullException.ThrowIfNull(options);

        for (var attempt = 0; ; attempt++)
        {
            try
            {
                using var request = createRequest();
                return await client.SendAsync(request, completionOption, cancellationToken).ConfigureAwait(false);
            }
            catch (HttpRequestException) when (attempt < options.RendererRetryCount)
            {
                var multiplier = 1 << Math.Min(attempt, 4);
                var delay = TimeSpan.FromTicks(options.RendererRetryDelay.Ticks * multiplier);
                if (delay > TimeSpan.Zero)
                    await Task.Delay(delay, cancellationToken).ConfigureAwait(false);
            }
            catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested
                && attempt < options.RendererRetryCount)
            {
                var multiplier = 1 << Math.Min(attempt, 4);
                var delay = TimeSpan.FromTicks(options.RendererRetryDelay.Ticks * multiplier);
                if (delay > TimeSpan.Zero)
                    await Task.Delay(delay, cancellationToken).ConfigureAwait(false);
            }
            catch (HttpRequestException exception)
            {
                throw new DotReactRendererUnavailableException(
                    "The React renderer is temporarily unavailable.", exception);
            }
            catch (TaskCanceledException exception) when (!cancellationToken.IsCancellationRequested)
            {
                throw new DotReactRendererUnavailableException(
                    "The React renderer connection timed out.", exception);
            }
        }
    }
}
