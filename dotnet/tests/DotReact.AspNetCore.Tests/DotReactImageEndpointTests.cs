using System.Net;
using DotReact.AspNetCore.Images;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace DotReact.AspNetCore.Tests;

public sealed class DotReactImageEndpointTests
{
    [Fact]
    public void Default_widths_cover_icons_logos_and_content_images()
    {
        var widths = new DotReactImageOptions().AllowedWidths;

        Assert.Contains(32, widths);
        Assert.Contains(48, widths);
        Assert.Contains(96, widths);
        Assert.Contains(320, widths);
        Assert.Contains(1920, widths);
    }

    [Fact]
    public void Mapping_without_a_processor_fails_early()
    {
        var builder = WebApplication.CreateBuilder();
        builder.Services.AddDotReactImages();
        var app = builder.Build();

        var exception = Assert.Throws<InvalidOperationException>(() => app.MapDotReactImages());

        Assert.Contains(nameof(IDotReactImageProcessor), exception.Message);
    }

    [Fact]
    public async Task Local_image_is_resized_encoded_and_revalidated_with_etag()
    {
        var root = CreateRoot();
        try
        {
            await File.WriteAllBytesAsync(Path.Combine(root, "photo.png"), [1, 2, 3, 4]);
            await using var app = await BuildAppAsync(root, options =>
            {
                options.AllowedWidths.Clear();
                options.AllowedWidths.Add(4);
                options.AllowedFormats.Clear();
                options.AllowedFormats.Add(DotReactImageFormat.Png);
            });
            var client = app.GetTestClient();

            using var response = await client.GetAsync("/_dotreact/image?src=%2Fphoto.png&w=4&f=png&q=80");

            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.Equal("image/png", response.Content.Headers.ContentType?.MediaType);
            Assert.Contains("public", response.Headers.CacheControl?.ToString());
            Assert.Equal("nosniff", response.Headers.GetValues("X-Content-Type-Options").Single());
            Assert.NotNull(response.Headers.ETag);
            Assert.Equal(TestImageProcessor.Output, await response.Content.ReadAsByteArrayAsync());

            using var conditional = new HttpRequestMessage(HttpMethod.Get, "/_dotreact/image?src=%2Fphoto.png&w=4&f=png&q=80");
            conditional.Headers.IfNoneMatch.Add(response.Headers.ETag);
            using var notModified = await client.SendAsync(conditional);
            Assert.Equal(HttpStatusCode.NotModified, notModified.StatusCode);
            Assert.Empty(await notModified.Content.ReadAsByteArrayAsync());
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Theory]
    [InlineData("src=%2F..%2Fsecret.png&w=4&f=png", HttpStatusCode.BadRequest)]
    [InlineData("src=%2Fphoto.png&w=5&f=png", HttpStatusCode.BadRequest)]
    [InlineData("src=%2Fphoto.png&w=4&f=svg", HttpStatusCode.BadRequest)]
    [InlineData("src=https%3A%2F%2Fimages.example%2Fphoto.png&w=4&f=png", HttpStatusCode.BadRequest)]
    public async Task Unsafe_or_unbounded_requests_are_rejected(string query, HttpStatusCode expected)
    {
        var root = CreateRoot();
        try
        {
            await File.WriteAllBytesAsync(Path.Combine(root, "photo.png"), [1, 2, 3, 4]);
            await using var app = await BuildAppAsync(root, options =>
            {
                options.AllowedWidths.Clear();
                options.AllowedWidths.Add(4);
                options.AllowedFormats.Clear();
                options.AllowedFormats.Add(DotReactImageFormat.Png);
            });

            using var response = await app.GetTestClient().GetAsync($"/_dotreact/image?{query}");

            Assert.Equal(expected, response.StatusCode);
            Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task Allowlisted_private_ip_is_still_blocked_by_safe_remote_transport()
    {
        var root = CreateRoot();
        try
        {
            await using var app = await BuildAppAsync(root, options =>
            {
                options.AllowedWidths.Clear();
                options.AllowedWidths.Add(4);
                options.AllowedFormats.Clear();
                options.AllowedFormats.Add(DotReactImageFormat.Png);
                options.AllowedRemoteOrigins.Add("https://127.0.0.1");
            });

            using var response = await app.GetTestClient().GetAsync(
                "/_dotreact/image?src=https%3A%2F%2F127.0.0.1%2Fphoto.png&w=4&f=png");

            Assert.Equal(HttpStatusCode.BadGateway, response.StatusCode);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task Concurrent_image_transforms_are_bounded_before_decode()
    {
        var root = CreateRoot();
        try
        {
            await File.WriteAllBytesAsync(Path.Combine(root, "photo.png"), [1, 2, 3, 4]);
            var processor = new BlockingImageProcessor();
            await using var app = await BuildAppAsync(root, options =>
            {
                options.MaxConcurrentTransforms = 1;
                options.AllowedWidths.Clear();
                options.AllowedWidths.Add(4);
                options.AllowedFormats.Clear();
                options.AllowedFormats.Add(DotReactImageFormat.Png);
            }, processor);
            var client = app.GetTestClient();

            var first = client.GetAsync("/_dotreact/image?src=%2Fphoto.png&w=4&f=png&q=80");
            await processor.Started.Task.WaitAsync(TimeSpan.FromSeconds(5));
            using var rejected = await client.GetAsync("/_dotreact/image?src=%2Fphoto.png&w=4&f=png&q=80");
            processor.Release.TrySetResult();
            using var completed = await first;

            Assert.Equal(HttpStatusCode.TooManyRequests, rejected.StatusCode);
            Assert.Equal("1", rejected.Headers.RetryAfter?.Delta?.TotalSeconds.ToString()
                ?? rejected.Headers.GetValues("Retry-After").Single());
            Assert.Equal(HttpStatusCode.OK, completed.StatusCode);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static async Task<WebApplication> BuildAppAsync(
        string root,
        Action<DotReactImageOptions> configure,
        IDotReactImageProcessor? processor = null)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions { WebRootPath = root });
        builder.WebHost.UseTestServer();
        builder.Services.AddDotReactImages(configure);
        builder.Services.AddSingleton(processor ?? new TestImageProcessor());
        var app = builder.Build();
        app.MapDotReactImages();
        await app.StartAsync();
        return app;
    }

    private static string CreateRoot()
    {
        var path = Path.Combine(Path.GetTempPath(), $"dotreact-images-{Guid.NewGuid():N}");
        Directory.CreateDirectory(path);
        return path;
    }

    private sealed class TestImageProcessor : IDotReactImageProcessor
    {
        internal static readonly byte[] Output = [137, 80, 78, 71];

        public Task<DotReactOptimizedImage> ProcessAsync(
            DotReactImageSource source,
            DotReactImageTransform transform,
            CancellationToken cancellationToken)
        {
            Assert.Equal(4, transform.Width);
            Assert.Equal(80, transform.Quality);
            Assert.Equal(DotReactImageFormat.Png, transform.Format);
            Assert.NotEmpty(source.Content);
            return Task.FromResult(new DotReactOptimizedImage(Output, "image/png"));
        }
    }

    private sealed class BlockingImageProcessor : IDotReactImageProcessor
    {
        internal TaskCompletionSource Started { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        internal TaskCompletionSource Release { get; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public async Task<DotReactOptimizedImage> ProcessAsync(
            DotReactImageSource source,
            DotReactImageTransform transform,
            CancellationToken cancellationToken)
        {
            Started.TrySetResult();
            await Release.Task.WaitAsync(cancellationToken);
            return new DotReactOptimizedImage(TestImageProcessor.Output, "image/png");
        }
    }
}
