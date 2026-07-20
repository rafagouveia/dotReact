using System.Globalization;
using System.Security.Cryptography;
using DotReact.AspNetCore;
using DotReact.AspNetCore.Images;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.Net.Http.Headers;

namespace Microsoft.AspNetCore.Routing;

/// <summary>Maps the configured DotReact image optimization endpoint.</summary>
public static class DotReactImageEndpointRouteBuilderExtensions
{
    /// <summary>Maps GET and HEAD handling at the configured image path.</summary>
    public static IEndpointConventionBuilder MapDotReactImages(this IEndpointRouteBuilder endpoints)
    {
        ArgumentNullException.ThrowIfNull(endpoints);
        _ = endpoints.ServiceProvider.GetService<IDotReactImageProcessor>()
            ?? throw new InvalidOperationException(
                "Register an IDotReactImageProcessor implementation before mapping DotReact images.");
        var path = endpoints.ServiceProvider.GetRequiredService<IOptions<DotReactImageOptions>>().Value.EndpointPath;
        var endpoint = endpoints.MapMethods(path, [HttpMethods.Get, HttpMethods.Head], DotReactImageEndpoint.HandleAsync)
            .WithDisplayName("DotReact image optimization");
        if (endpoints.ServiceProvider.GetService<DotReactRateLimitingRegistration>() is not null)
            endpoint.RequireRateLimiting(DotReactRateLimiting.ImagePolicyName);
        return endpoint;
    }
}

internal static class DotReactImageEndpoint
{
    internal static async Task HandleAsync(
        HttpContext context,
        IDotReactImageSourceReader sourceReader,
        IDotReactImageProcessor processor,
        DotReactImageConcurrencyGate concurrency,
        IOptions<DotReactImageOptions> optionsAccessor)
    {
        var options = optionsAccessor.Value;
        try
        {
            var source = SingleQuery(context, "src");
            if (source.Length is 0 or > 2048) throw InvalidRequest();
            var width = ParseInteger(SingleQuery(context, "w"));
            if (!options.AllowedWidths.Contains(width)) throw InvalidRequest();
            var qualityValue = OptionalSingleQuery(context, "q");
            var quality = qualityValue is null ? options.DefaultQuality : ParseInteger(qualityValue);
            if (quality < options.MinimumQuality || quality > options.MaximumQuality) throw InvalidRequest();
            var formatValue = OptionalSingleQuery(context, "f") ?? "auto";
            var format = SelectFormat(formatValue, context.Request.GetTypedHeaders().Accept, options);

            using var lease = await concurrency.TryAcquireAsync(context.RequestAborted);
            if (lease is null)
            {
                context.Response.Headers.RetryAfter = "1";
                throw new DotReactImageRequestException(
                    StatusCodes.Status429TooManyRequests,
                    "Too many image transformations are already running.");
            }
            var input = await sourceReader.ReadAsync(source, context.RequestAborted);
            var output = await processor.ProcessAsync(
                input,
                new DotReactImageTransform(width, quality, format),
                context.RequestAborted);
            var etag = $"\"{Convert.ToHexString(SHA256.HashData(output.Content)).ToLowerInvariant()}\"";

            context.Response.Headers.ETag = etag;
            context.Response.Headers.CacheControl = $"public,max-age={(long)options.ClientCacheDuration.TotalSeconds},must-revalidate";
            context.Response.Headers.XContentTypeOptions = "nosniff";
            if (formatValue.Equals("auto", StringComparison.OrdinalIgnoreCase))
                context.Response.Headers.Append(HeaderNames.Vary, HeaderNames.Accept);
            if (context.Request.Headers.IfNoneMatch.Any(value =>
                    value is not null && (value == "*" || value.Split(',').Any(tag => tag.Trim() == etag))))
            {
                context.Response.StatusCode = StatusCodes.Status304NotModified;
                return;
            }
            context.Response.StatusCode = StatusCodes.Status200OK;
            context.Response.ContentType = output.ContentType;
            context.Response.ContentLength = output.Content.Length;
            if (!HttpMethods.IsHead(context.Request.Method))
                await context.Response.Body.WriteAsync(output.Content, context.RequestAborted);
        }
        catch (DotReactImageRequestException exception)
        {
            await Results.Problem(statusCode: exception.StatusCode, title: exception.Message).ExecuteAsync(context);
        }
    }

    private static DotReactImageFormat SelectFormat(
        string value,
        IList<MediaTypeHeaderValue>? accepted,
        DotReactImageOptions options)
    {
        DotReactImageFormat selected;
        if (value.Equals("auto", StringComparison.OrdinalIgnoreCase))
        {
            selected = options.AllowedFormats.Contains(DotReactImageFormat.Webp)
                && accepted?.Any(static item => string.Equals(item.MediaType.Value, "image/webp", StringComparison.OrdinalIgnoreCase)) == true
                    ? DotReactImageFormat.Webp
                    : options.AllowedFormats.OrderBy(static format => format).First();
        }
        else if (!Enum.TryParse(value, ignoreCase: true, out selected))
        {
            throw InvalidRequest();
        }
        if (!options.AllowedFormats.Contains(selected)) throw InvalidRequest();
        return selected;
    }

    private static string SingleQuery(HttpContext context, string name) =>
        context.Request.Query.TryGetValue(name, out var values) && values.Count == 1 && values[0] is { } value
            ? value
            : throw InvalidRequest();

    private static string? OptionalSingleQuery(HttpContext context, string name) =>
        !context.Request.Query.TryGetValue(name, out var values) ? null
            : values.Count == 1 && values[0] is { } value ? value : throw InvalidRequest();

    private static int ParseInteger(string value) =>
        int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out var result) ? result : throw InvalidRequest();

    private static DotReactImageRequestException InvalidRequest() =>
        new(StatusCodes.Status400BadRequest, "Image request parameters are invalid.");
}
