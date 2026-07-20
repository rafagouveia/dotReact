using DotReact.AspNetCore;
using Microsoft.AspNetCore.Authorization;
using Xunit;

namespace DotReact.AspNetCore.Tests;

public sealed class DotReactPrerenderingTests
{
    [Fact]
    public async Task Concurrent_misses_share_one_generation()
    {
        var store = new DotReactMemoryPrerenderStore();
        var coordinator = new DotReactPrerenderCoordinator(store);
        var key = new DotReactPrerenderKey("build-a", "/products/42");
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var calls = 0;

        async ValueTask<DotReactPrerenderArtifact> Generate(CancellationToken _)
        {
            Interlocked.Increment(ref calls);
            await release.Task;
            return Artifact(key, "generated");
        }

        var requests = Enumerable.Range(0, 20)
            .Select(_ => coordinator.GetOrCreateAsync(key, Generate).AsTask()).ToArray();
        await WaitUntilAsync(() => Volatile.Read(ref calls) == 1);
        release.SetResult();
        var results = await Task.WhenAll(requests);

        Assert.Equal(1, calls);
        Assert.All(results, result => Assert.Equal("generated", result.Artifact.Html));
        Assert.All(results, result => Assert.Equal(DotReactPrerenderResolution.Generated, result.Resolution));
    }

    [Fact]
    public async Task Stale_artifact_is_returned_immediately_and_background_refresh_is_single_flight()
    {
        var time = new MutableTimeProvider(DateTimeOffset.Parse("2026-01-01T00:00:00Z"));
        var store = new DotReactMemoryPrerenderStore();
        var coordinator = new DotReactPrerenderCoordinator(store, time);
        var key = new DotReactPrerenderKey("build-a", "/news");
        await store.SetAsync(Artifact(key, "stale", time.GetUtcNow(), TimeSpan.FromSeconds(1), TimeSpan.FromMinutes(1)));
        time.Advance(TimeSpan.FromSeconds(2));
        var release = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        var calls = 0;

        async ValueTask<DotReactPrerenderArtifact> Generate(CancellationToken _)
        {
            Interlocked.Increment(ref calls);
            await release.Task;
            return Artifact(key, "fresh", time.GetUtcNow());
        }

        var results = await Task.WhenAll(Enumerable.Range(0, 10)
            .Select(_ => coordinator.GetOrCreateAsync(key, Generate).AsTask()));

        Assert.All(results, result => Assert.Equal("stale", result.Artifact.Html));
        Assert.All(results, result =>
            Assert.Equal(DotReactPrerenderResolution.StaleWhileRevalidate, result.Resolution));
        Assert.Equal(1, calls);
        release.SetResult();
        await WaitUntilAsync(async () => (await store.GetAsync(key))?.Html == "fresh");
    }

    [Fact]
    public async Task Expired_artifact_is_served_when_synchronous_regeneration_fails()
    {
        var time = new MutableTimeProvider(DateTimeOffset.Parse("2026-01-01T00:00:00Z"));
        var store = new DotReactMemoryPrerenderStore();
        var coordinator = new DotReactPrerenderCoordinator(store, time);
        var key = new DotReactPrerenderKey("build-a", "/news");
        await store.SetAsync(Artifact(key, "last-good", time.GetUtcNow(), TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(1)));
        time.Advance(TimeSpan.FromSeconds(3));

        var result = await coordinator.GetOrCreateAsync(key, _ =>
            ValueTask.FromException<DotReactPrerenderArtifact>(new InvalidOperationException("renderer unavailable")));

        Assert.Equal("last-good", result.Artifact.Html);
        Assert.Equal(DotReactPrerenderResolution.StaleOnError, result.Resolution);
        Assert.Equal("last-good", (await store.GetAsync(key))?.Html);
    }

    [Fact]
    public async Task Background_regeneration_failure_keeps_stale_artifact_and_allows_retry()
    {
        var time = new MutableTimeProvider(DateTimeOffset.Parse("2026-01-01T00:00:00Z"));
        var store = new DotReactMemoryPrerenderStore();
        var coordinator = new DotReactPrerenderCoordinator(store, time);
        var key = new DotReactPrerenderKey("build-a", "/news");
        await store.SetAsync(Artifact(key, "last-good", time.GetUtcNow(), TimeSpan.FromSeconds(1), TimeSpan.FromMinutes(1)));
        time.Advance(TimeSpan.FromSeconds(2));
        var calls = 0;

        ValueTask<DotReactPrerenderArtifact> Fail(CancellationToken _)
        {
            Interlocked.Increment(ref calls);
            return ValueTask.FromException<DotReactPrerenderArtifact>(new InvalidOperationException("renderer unavailable"));
        }

        var first = await coordinator.GetOrCreateAsync(key, Fail);
        await WaitUntilAsync(() => Volatile.Read(ref calls) == 1);
        var second = await coordinator.GetOrCreateAsync(key, Fail);
        await WaitUntilAsync(() => Volatile.Read(ref calls) == 2);

        Assert.Equal(DotReactPrerenderResolution.StaleWhileRevalidate, first.Resolution);
        Assert.Equal(DotReactPrerenderResolution.StaleWhileRevalidate, second.Resolution);
        Assert.Equal("last-good", (await store.GetAsync(key))?.Html);
    }

    [Fact]
    public async Task Build_ids_are_isolated_and_invalidation_is_scoped_by_path_and_tag()
    {
        var store = new DotReactMemoryPrerenderStore();
        var first = new DotReactPrerenderKey("build-a", "/products/42");
        var second = new DotReactPrerenderKey("build-b", "/products/42");
        await store.SetAsync(Artifact(first, "a", tags: ["products"]));
        await store.SetAsync(Artifact(second, "b", tags: ["products"]));

        Assert.True(await store.InvalidatePathAsync(first));
        Assert.Null(await store.GetAsync(first));
        Assert.Equal("b", (await store.GetAsync(second))?.Html);

        Assert.Equal(1, await store.InvalidateTagAsync("build-b", "products"));
        Assert.Null(await store.GetAsync(second));
    }

    [Fact]
    public async Task Memory_store_evicts_least_recently_used_entries_within_bounds()
    {
        var store = new DotReactMemoryPrerenderStore(new DotReactMemoryPrerenderStoreOptions
        {
            MaxEntries = 2,
            MaxBytes = 10_000
        });
        var one = new DotReactPrerenderKey("build", "/one");
        var two = new DotReactPrerenderKey("build", "/two");
        var three = new DotReactPrerenderKey("build", "/three");
        await store.SetAsync(Artifact(one, "one"));
        await store.SetAsync(Artifact(two, "two"));
        _ = await store.GetAsync(one);
        await store.SetAsync(Artifact(three, "three"));

        Assert.NotNull(await store.GetAsync(one));
        Assert.Null(await store.GetAsync(two));
        Assert.NotNull(await store.GetAsync(three));
    }

    [Fact]
    public void Artifact_rejects_request_specific_security_material()
    {
        var key = new DotReactPrerenderKey("build", "/");

        var exception = Assert.Throws<ArgumentException>(() =>
            DotReactPrerenderArtifact.Create(key, "<meta name=\"dotreact-csrf-token\" content=\"secret\">", DateTimeOffset.UtcNow));

        Assert.Contains("forbidden request-specific marker", exception.Message);
    }

    [Theory]
    [InlineData("/../secret")]
    [InlineData("/%2e%2e/secret")]
    [InlineData("/safe%5c..%5csecret")]
    public void Prerender_keys_reject_path_traversal(string path)
    {
        Assert.Throws<ArgumentException>(() => new DotReactPrerenderKey("build", path));
    }

    [Fact]
    public void Metadata_rejects_authorized_pages_and_exposes_typed_path_provider()
    {
        Assert.Throws<InvalidOperationException>(() => DotReactPrerenderMetadata.Create(typeof(AuthorizedPage)));

        var metadata = DotReactPrerenderMetadata.Create(typeof(DynamicPage));

        Assert.Equal(typeof(IDotReactStaticPathProvider<DynamicPage>), metadata.StaticPathProviderType);
        Assert.Equal(TimeSpan.FromSeconds(30), metadata.FreshFor);
        Assert.Equal(TimeSpan.FromSeconds(120), metadata.StaleWhileRevalidateFor);
        Assert.Equal(["catalog", "products"], metadata.Tags);
    }

    private static DotReactPrerenderArtifact Artifact(
        DotReactPrerenderKey key,
        string html,
        DateTimeOffset? generatedAt = null,
        TimeSpan? freshFor = null,
        TimeSpan? staleFor = null,
        IEnumerable<string>? tags = null) =>
        DotReactPrerenderArtifact.Create(
            key, html, generatedAt ?? DateTimeOffset.UtcNow, freshFor, staleFor, tags);

    private static async Task WaitUntilAsync(Func<bool> condition)
    {
        for (var attempt = 0; attempt < 100; attempt++)
        {
            if (condition()) return;
            await Task.Delay(10);
        }
        throw new TimeoutException("Condition was not reached.");
    }

    private static async Task WaitUntilAsync(Func<Task<bool>> condition)
    {
        for (var attempt = 0; attempt < 100; attempt++)
        {
            if (await condition()) return;
            await Task.Delay(10);
        }
        throw new TimeoutException("Condition was not reached.");
    }

    [DotReactPrerender(30, StaleWhileRevalidateSeconds = 120, Tags = ["products", "catalog", "products"])]
    private sealed class DynamicPage;

    [Authorize]
    [DotReactPrerender]
    private sealed class AuthorizedPage;

    private sealed class MutableTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        private DateTimeOffset _utcNow = utcNow;

        public override DateTimeOffset GetUtcNow() => _utcNow;

        public void Advance(TimeSpan duration) => _utcNow += duration;
    }
}
