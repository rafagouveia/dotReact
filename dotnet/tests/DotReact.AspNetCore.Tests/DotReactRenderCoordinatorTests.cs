using System.Text.Json;
using System.Runtime.CompilerServices;
using DotReact.AspNetCore;
using Microsoft.Extensions.Options;
using Xunit;

namespace DotReact.AspNetCore.Tests;

public sealed class DotReactRenderCoordinatorTests
{
    [Fact]
    public async Task Identical_concurrent_renders_share_one_flight_but_keep_request_ids()
    {
        var options = Options.Create(new DotReactOptions
        {
            RequestTimeout = TimeSpan.FromSeconds(5)
        });
        using var admission = new DotReactRenderAdmissionController(options);
        var coordinator = new DotReactRenderCoordinator(options, admission);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var calls = 0;
        async Task<DotReactRenderResponse> Render(DotReactRenderRequest request, CancellationToken cancellationToken)
        {
            Interlocked.Increment(ref calls);
            await release.Task.WaitAsync(cancellationToken);
            return new DotReactRenderResponse
            {
                ProtocolVersion = 1,
                RequestId = request.RequestId,
                Ok = true,
                Html = "<main>shared</main>"
            };
        }

        var tasks = Enumerable.Range(0, 32).Select(index => coordinator.RenderAsync(
            new DotReactRenderRequest(
                1, $"request-{index}", "page", "/same", JsonSerializer.SerializeToElement(new { value = 42 }), "ssr"),
            Render,
            CancellationToken.None)).ToArray();
        await Task.Delay(25);
        release.SetResult();
        var responses = await Task.WhenAll(tasks);

        Assert.Equal(1, calls);
        Assert.Equal(32, responses.Select(response => response.RequestId).Distinct().Count());
        Assert.All(responses, response => Assert.Equal("<main>shared</main>", response.Html));
    }

    [Fact]
    public async Task Full_renderer_budget_rejects_new_unique_work_without_an_unbounded_queue()
    {
        var options = Options.Create(new DotReactOptions
        {
            RequestTimeout = TimeSpan.FromSeconds(5),
            RendererFrameConnectionCount = 1,
            RendererFrameMaxInFlightPerConnection = 1,
            RendererMaxQueuedRequests = 0
        });
        using var admission = new DotReactRenderAdmissionController(options);
        var coordinator = new DotReactRenderCoordinator(options, admission);
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        async Task<DotReactRenderResponse> Render(
            DotReactRenderRequest request,
            CancellationToken cancellationToken)
        {
            entered.TrySetResult();
            await release.Task.WaitAsync(cancellationToken);
            return new DotReactRenderResponse
            {
                ProtocolVersion = 1,
                RequestId = request.RequestId,
                Ok = true,
                Html = "<main>bounded</main>"
            };
        }

        var first = coordinator.RenderAsync(Request("first", "/first"), Render, CancellationToken.None);
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(1));

        await Assert.ThrowsAsync<DotReactRendererCapacityException>(() =>
            coordinator.RenderAsync(Request("second", "/second"), Render, CancellationToken.None));

        release.SetResult();
        await first;
    }

    [Fact]
    public async Task Streaming_render_holds_and_releases_the_same_global_capacity_budget()
    {
        var options = Options.Create(new DotReactOptions
        {
            RendererFrameConnectionCount = 1,
            RendererFrameMaxInFlightPerConnection = 1,
            RendererMaxQueuedRequests = 0
        });
        using var admission = new DotReactRenderAdmissionController(options);
        var entered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);

        async IAsyncEnumerable<int> Stream(
            [EnumeratorCancellation] CancellationToken cancellationToken)
        {
            entered.TrySetResult();
            await release.Task.WaitAsync(cancellationToken);
            yield return 1;
        }

        var streaming = Task.Run(async () =>
        {
            await foreach (var _ in admission.ExecuteStreamAsync(Stream, CancellationToken.None)) { }
        });
        await entered.Task.WaitAsync(TimeSpan.FromSeconds(1));

        await Assert.ThrowsAsync<DotReactRendererCapacityException>(() =>
            admission.ExecuteAsync(_ => Task.FromResult(2), CancellationToken.None));

        release.SetResult();
        await streaming;
        Assert.Equal(3, await admission.ExecuteAsync(_ => Task.FromResult(3), CancellationToken.None));
    }

    private static DotReactRenderRequest Request(string requestId, string url) => new(
        1, requestId, "page", url, JsonSerializer.SerializeToElement(new { value = 42 }), "ssr");
}
