using DotReact.AspNetCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace DotReact.AspNetCore.Tests;

public sealed class DotReactActionIdempotencyTests
{
    [Fact]
    public async Task Default_store_replays_within_retention_and_executes_again_after_expiration()
    {
        var clock = new FakeTimeProvider(new DateTimeOffset(2026, 7, 18, 12, 0, 0, TimeSpan.Zero));
        var services = new ServiceCollection();
        services.AddSingleton<TimeProvider>(clock);
        services.AddDotReact(options => options.ClientScriptSrc = "/client.js");
        await using var provider = services.BuildServiceProvider();
        var store = provider.GetRequiredService<IDotReactActionIdempotencyStore>();
        var calls = 0;

        ValueTask<DotReactStoredActionResponse> Execute(CancellationToken _)
        {
            calls++;
            return ValueTask.FromResult(new DotReactStoredActionResponse(
                200, "application/json", [(byte)calls], []));
        }

        var first = await store.ExecuteAsync(
            "scope", "request-key", "fingerprint", TimeSpan.FromSeconds(1), Execute,
            TestContext.Current.CancellationToken);
        var replay = await store.ExecuteAsync(
            "scope", "request-key", "fingerprint", TimeSpan.FromSeconds(1), Execute,
            TestContext.Current.CancellationToken);
        clock.Advance(TimeSpan.FromSeconds(2));
        var expired = await store.ExecuteAsync(
            "scope", "request-key", "fingerprint", TimeSpan.FromSeconds(1), Execute,
            TestContext.Current.CancellationToken);

        Assert.False(first.Replayed);
        Assert.True(replay.Replayed);
        Assert.False(expired.Replayed);
        Assert.Equal(2, calls);
        Assert.Equal([(byte)1], Assert.IsType<byte[]>(replay.Response?.Body));
        Assert.Equal([(byte)2], Assert.IsType<byte[]>(expired.Response?.Body));
    }

    [Fact]
    public void Revalidation_rejects_external_or_ambiguous_paths()
    {
        Assert.Throws<ArgumentException>(() =>
            DotReactActionResult<object>.Success(new(), ["https://example.com"]));
        Assert.Throws<ArgumentException>(() =>
            DotReactActionResult<object>.Success(new(), ["//example.com"]));
        Assert.Throws<ArgumentException>(() =>
            DotReactActionResult<object>.Success(new(), ["/safe\\escape"]));
    }

    private sealed class FakeTimeProvider(DateTimeOffset now) : TimeProvider
    {
        private DateTimeOffset _now = now;
        public override DateTimeOffset GetUtcNow() => _now;
        public void Advance(TimeSpan duration) => _now += duration;
    }
}
