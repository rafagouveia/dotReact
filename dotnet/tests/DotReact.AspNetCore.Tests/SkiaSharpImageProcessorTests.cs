using DotReact.AspNetCore.Images;
using DotReact.Images.SkiaSharp;
using Microsoft.Extensions.Options;
using SkiaSharp;
using Xunit;

namespace DotReact.AspNetCore.Tests;

public sealed class SkiaSharpImageProcessorTests
{
    [Fact]
    public async Task Processor_resizes_and_encodes_a_real_webp_raster()
    {
        using var bitmap = new SKBitmap(40, 20);
        bitmap.Erase(SKColors.MediumPurple);
        using var sourceImage = SKImage.FromBitmap(bitmap);
        using var sourceData = sourceImage.Encode(SKEncodedImageFormat.Png, 100);
        var processor = new SkiaSharpDotReactImageProcessor(Options.Create(new DotReactImageOptions()));

        var result = await processor.ProcessAsync(
            new DotReactImageSource(sourceData.ToArray(), "test-source"),
            new DotReactImageTransform(20, 70, DotReactImageFormat.Webp),
            TestContext.Current.CancellationToken);

        Assert.Equal("image/webp", result.ContentType);
        using var decoded = SKBitmap.Decode(result.Content);
        Assert.NotNull(decoded);
        Assert.Equal(20, decoded.Width);
        Assert.Equal(10, decoded.Height);
    }

    [Fact]
    public async Task Processor_rejects_images_above_the_decoded_pixel_budget()
    {
        using var bitmap = new SKBitmap(4, 4);
        bitmap.Erase(SKColors.Black);
        using var sourceImage = SKImage.FromBitmap(bitmap);
        using var sourceData = sourceImage.Encode(SKEncodedImageFormat.Png, 100);
        var processor = new SkiaSharpDotReactImageProcessor(Options.Create(new DotReactImageOptions
        {
            MaximumSourcePixels = 15
        }));

        await Assert.ThrowsAsync<DotReactImageRequestException>(() => processor.ProcessAsync(
            new DotReactImageSource(sourceData.ToArray(), "too-large"),
            new DotReactImageTransform(4, 75, DotReactImageFormat.Png),
            TestContext.Current.CancellationToken));
    }
}
