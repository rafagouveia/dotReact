using DotReact.AspNetCore.Images;
using Microsoft.Extensions.Options;
using SkiaSharp;

namespace DotReact.Images.SkiaSharp;

/// <summary>Cross-platform bounded raster processor backed by Skia.</summary>
public sealed class SkiaSharpDotReactImageProcessor(IOptions<DotReactImageOptions> options)
    : IDotReactImageProcessor
{
    private readonly DotReactImageOptions _options = options.Value;

    /// <inheritdoc />
    public Task<DotReactOptimizedImage> ProcessAsync(
        DotReactImageSource source,
        DotReactImageTransform transform,
        CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(source);
        ArgumentNullException.ThrowIfNull(transform);
        cancellationToken.ThrowIfCancellationRequested();
        try
        {
            using var data = SKData.CreateCopy(source.Content);
            using var codec = SKCodec.Create(data)
                ?? throw InvalidImage("The source is not a supported raster image.");
            var info = codec.Info;
            var pixels = checked((long)info.Width * info.Height);
            if (info.Width <= 0 || info.Height <= 0 || pixels > _options.MaximumSourcePixels)
                throw InvalidImage("The decoded image dimensions exceed the configured limit.");
            using var sourceBitmap = SKBitmap.Decode(codec)
                ?? throw InvalidImage("The source image could not be decoded.");
            var width = Math.Min(transform.Width, sourceBitmap.Width);
            var height = Math.Max(1, (int)Math.Round(
                sourceBitmap.Height * (width / (double)sourceBitmap.Width), MidpointRounding.AwayFromZero));
            var imageInfo = new SKImageInfo(width, height, SKColorType.Rgba8888, SKAlphaType.Premul);
            using var surface = SKSurface.Create(imageInfo)
                ?? throw InvalidImage("The optimized image surface could not be allocated.");
            surface.Canvas.Clear(transform.Format == DotReactImageFormat.Jpeg ? SKColors.White : SKColors.Transparent);
            surface.Canvas.DrawBitmap(
                sourceBitmap,
                new SKRect(0, 0, width, height),
                new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear));
            surface.Canvas.Flush();
            using var image = surface.Snapshot();
            using var encoded = image.Encode(EncodedFormat(transform.Format), transform.Quality)
                ?? throw InvalidImage("The optimized image could not be encoded.");
            var content = encoded.ToArray();
            if (content.LongLength > _options.MaximumSourceBytes * 2)
                throw InvalidImage("The optimized image exceeds the configured output limit.");
            cancellationToken.ThrowIfCancellationRequested();
            return Task.FromResult(new DotReactOptimizedImage(content, ContentType(transform.Format)));
        }
        catch (DotReactImageRequestException)
        {
            throw;
        }
        catch (OverflowException)
        {
            throw InvalidImage("The decoded image dimensions are invalid.");
        }
    }

    private static SKEncodedImageFormat EncodedFormat(DotReactImageFormat format) => format switch
    {
        DotReactImageFormat.Jpeg => SKEncodedImageFormat.Jpeg,
        DotReactImageFormat.Png => SKEncodedImageFormat.Png,
        DotReactImageFormat.Webp => SKEncodedImageFormat.Webp,
        _ => throw InvalidImage("The requested output format is unsupported.")
    };

    private static string ContentType(DotReactImageFormat format) => format switch
    {
        DotReactImageFormat.Jpeg => "image/jpeg",
        DotReactImageFormat.Png => "image/png",
        DotReactImageFormat.Webp => "image/webp",
        _ => throw InvalidImage("The requested output format is unsupported.")
    };

    private static DotReactImageRequestException InvalidImage(string message) => new(415, message);
}
