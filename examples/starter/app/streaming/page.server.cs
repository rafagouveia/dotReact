using System.Globalization;
using DotReact.AspNetCore;

namespace DotReact.Starter.Pages.Streaming;

public sealed record StreamingPageProps(string RenderKey, int DelayMs);

[DotReactStreaming]
public sealed class StreamingPage(TimeProvider timeProvider) : IDotReactPage<StreamingPageProps>
{
    public ValueTask<StreamingPageProps> LoadAsync(
        DotReactPageContext context,
        CancellationToken cancellationToken) => ValueTask.FromResult(
            new StreamingPageProps(
                string.Concat(
                    timeProvider.GetUtcNow().Ticks.ToString(CultureInfo.InvariantCulture),
                    ":",
                    context.HttpContext.TraceIdentifier),
                350));
}
