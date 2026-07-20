using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;

namespace DotReact.AspNetCore.Images;

internal sealed class DotReactImageSourceReader(
    IWebHostEnvironment environment,
    IHttpClientFactory httpClientFactory,
    IOptions<DotReactImageOptions> optionsAccessor) : IDotReactImageSourceReader
{
    private readonly DotReactImageOptions options = optionsAccessor.Value;
    private readonly HashSet<string> allowedOrigins = NormalizeOrigins(optionsAccessor.Value.AllowedRemoteOrigins);

    public async Task<DotReactImageSource> ReadAsync(string source, CancellationToken cancellationToken)
    {
        try
        {
            return await (source.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
                && Uri.TryCreate(source, UriKind.Absolute, out var uri)
                    ? ReadRemoteAsync(uri, cancellationToken)
                    : ReadLocalAsync(source, cancellationToken));
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new DotReactImageRequestException(StatusCodes.Status504GatewayTimeout, "Remote image source timed out.");
        }
        catch (HttpRequestException)
        {
            throw new DotReactImageRequestException(StatusCodes.Status502BadGateway, "Remote image source failed.");
        }
    }

    private async Task<DotReactImageSource> ReadRemoteAsync(Uri uri, CancellationToken cancellationToken)
    {
        var origin = uri.GetLeftPart(UriPartial.Authority);
        if (uri.Scheme != Uri.UriSchemeHttps || !string.IsNullOrEmpty(uri.UserInfo)
            || !allowedOrigins.Contains(origin))
            throw InvalidSource();

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(options.RemoteRequestTimeout);
        using var request = new HttpRequestMessage(HttpMethod.Get, uri);
        request.Headers.Accept.ParseAdd("image/avif,image/webp,image/png,image/jpeg,image/gif;q=0.8");
        using var response = await httpClientFactory.CreateClient(DotReactImageHttpClient.Name)
            .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
        if (response.StatusCode == HttpStatusCode.NotFound)
            throw new DotReactImageRequestException(StatusCodes.Status404NotFound, "Image source was not found.");
        if (!response.IsSuccessStatusCode)
            throw new DotReactImageRequestException(StatusCodes.Status502BadGateway, "Remote image source failed.");
        if (response.Content.Headers.ContentLength is { } length && length > options.MaximumSourceBytes)
            throw TooLarge();
        var contentType = response.Content.Headers.ContentType?.MediaType;
        if (contentType is null || !contentType.StartsWith("image/", StringComparison.OrdinalIgnoreCase))
            throw InvalidSource();

        await using var stream = await response.Content.ReadAsStreamAsync(timeout.Token);
        var content = await ReadBoundedAsync(stream, options.MaximumSourceBytes, timeout.Token);
        return new DotReactImageSource(content, Convert.ToHexString(SHA256.HashData(content)));
    }

    private async Task<DotReactImageSource> ReadLocalAsync(string source, CancellationToken cancellationToken)
    {
        if (!source.StartsWith('/') || source.StartsWith("//", StringComparison.Ordinal)
            || source.IndexOfAny(['\\', '\0', '?', '#']) >= 0)
            throw InvalidSource();
        var segments = source.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segments.Length == 0 || segments.Any(static segment => segment is "." or ".."))
            throw InvalidSource();

        var configuredRoot = options.LocalRootPath ?? environment.WebRootPath;
        if (string.IsNullOrWhiteSpace(configuredRoot))
            throw new DotReactImageRequestException(StatusCodes.Status404NotFound, "Local image source was not found.");
        var root = ResolveLink(new DirectoryInfo(Path.GetFullPath(configuredRoot)));
        if (!root.Exists)
            throw new DotReactImageRequestException(StatusCodes.Status404NotFound, "Local image source was not found.");

        DirectoryInfo directory = root;
        for (var index = 0; index < segments.Length - 1; index++)
        {
            directory = ResolveLink(new DirectoryInfo(Path.Combine(directory.FullName, segments[index])));
            EnsureWithinRoot(root.FullName, directory.FullName);
            if (!directory.Exists)
                throw new DotReactImageRequestException(StatusCodes.Status404NotFound, "Local image source was not found.");
        }
        var file = ResolveLink(new FileInfo(Path.Combine(directory.FullName, segments[^1])));
        EnsureWithinRoot(root.FullName, file.FullName);
        if (!file.Exists)
            throw new DotReactImageRequestException(StatusCodes.Status404NotFound, "Local image source was not found.");
        if (file.Length > options.MaximumSourceBytes)
            throw TooLarge();

        await using var stream = new FileStream(file.FullName, FileMode.Open, FileAccess.Read, FileShare.Read,
            bufferSize: 64 * 1024, FileOptions.Asynchronous | FileOptions.SequentialScan);
        var content = await ReadBoundedAsync(stream, options.MaximumSourceBytes, cancellationToken);
        return new DotReactImageSource(content, $"{file.Length:x}-{file.LastWriteTimeUtc.Ticks:x}");
    }

    private static async Task<byte[]> ReadBoundedAsync(Stream source, long maximumBytes, CancellationToken cancellationToken)
    {
        using var destination = new MemoryStream((int)Math.Min(maximumBytes, 128 * 1024));
        var buffer = new byte[64 * 1024];
        long total = 0;
        while (true)
        {
            var count = await source.ReadAsync(buffer, cancellationToken);
            if (count == 0) break;
            total += count;
            if (total > maximumBytes) throw TooLarge();
            await destination.WriteAsync(buffer.AsMemory(0, count), cancellationToken);
        }
        return destination.ToArray();
    }

    private static T ResolveLink<T>(T entry) where T : FileSystemInfo
    {
        if (!entry.Exists || entry.LinkTarget is null) return entry;
        return entry.ResolveLinkTarget(returnFinalTarget: true) is T target ? target : entry;
    }

    private static void EnsureWithinRoot(string root, string candidate)
    {
        var relative = Path.GetRelativePath(root, candidate);
        if (relative == ".." || relative.StartsWith($"..{Path.DirectorySeparatorChar}", StringComparison.Ordinal)
            || Path.IsPathFullyQualified(relative))
            throw InvalidSource();
    }

    private static HashSet<string> NormalizeOrigins(IEnumerable<string> origins)
    {
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var origin in origins)
            if (DotReactImageOptionsValidator.TryNormalizeRemoteOrigin(origin, out var normalized)) result.Add(normalized);
        return result;
    }

    private static DotReactImageRequestException InvalidSource() =>
        new(StatusCodes.Status400BadRequest, "Image source is not allowed.");

    private static DotReactImageRequestException TooLarge() =>
        new(StatusCodes.Status413PayloadTooLarge, "Image source exceeds the configured limit.");
}

internal static class DotReactImageHttpClient
{
    internal const string Name = "DotReact.Images";
}

internal static class DotReactImageSafeConnect
{
    internal static async ValueTask<Stream> ConnectAsync(
        SocketsHttpConnectionContext context,
        CancellationToken cancellationToken)
    {
        var addresses = await Dns.GetHostAddressesAsync(context.DnsEndPoint.Host, cancellationToken);
        foreach (var address in addresses.Where(IsPublicAddress))
        {
            var socket = new Socket(address.AddressFamily, SocketType.Stream, ProtocolType.Tcp);
            try
            {
                await socket.ConnectAsync(new IPEndPoint(address, context.DnsEndPoint.Port), cancellationToken);
                return new NetworkStream(socket, ownsSocket: true);
            }
            catch (OperationCanceledException)
            {
                socket.Dispose();
                throw;
            }
            catch
            {
                socket.Dispose();
            }
        }
        throw new HttpRequestException("Remote image host did not resolve to an allowed public address.");
    }

    internal static bool IsPublicAddress(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6) return IsPublicAddress(address.MapToIPv4());
        if (address.AddressFamily == AddressFamily.InterNetworkV6)
        {
            var bytes = address.GetAddressBytes();
            return !IPAddress.IsLoopback(address) && !address.IsIPv6LinkLocal && !address.IsIPv6Multicast
                && (bytes[0] & 0xE0) == 0x20
                && !(bytes[0] == 0x20 && bytes[1] == 0x01 && bytes[2] == 0x0D && bytes[3] == 0xB8);
        }
        if (address.AddressFamily != AddressFamily.InterNetwork) return false;
        var value = address.GetAddressBytes();
        return value[0] is not (0 or 10 or 127)
            && !(value[0] == 100 && value[1] is >= 64 and <= 127)
            && !(value[0] == 169 && value[1] == 254)
            && !(value[0] == 172 && value[1] is >= 16 and <= 31)
            && !(value[0] == 192 && value[1] == 168)
            && !(value[0] == 192 && value[1] == 0)
            && !(value[0] == 192 && value[1] == 0 && value[2] == 2)
            && !(value[0] == 198 && value[1] is 18 or 19)
            && !(value[0] == 198 && value[1] == 51 && value[2] == 100)
            && !(value[0] == 203 && value[1] == 0 && value[2] == 113)
            && value[0] < 224;
    }
}
