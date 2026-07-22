using System.IO.Pipes;
using System.Net.Sockets;

namespace DotReact.AspNetCore;

internal static class DotReactRendererInterprocessEndpoint
{
    private const string WindowsPipePrefix = @"\\.\pipe\";

    internal static string CreateDefault(string purpose = "")
    {
        var suffix = string.IsNullOrEmpty(purpose) ? string.Empty : $"-{purpose}";
        return OperatingSystem.IsWindows()
            ? $@"{WindowsPipePrefix}dotreact-renderer-{Environment.ProcessId}{suffix}"
            : Path.Combine(Path.GetTempPath(), $"dotreact-renderer-{Environment.ProcessId}{suffix}.sock");
    }

    internal static bool IsValid(string? endpoint)
    {
        if (string.IsNullOrWhiteSpace(endpoint)) return false;
        if (OperatingSystem.IsWindows())
            return endpoint.StartsWith(WindowsPipePrefix, StringComparison.OrdinalIgnoreCase)
                && endpoint.Length > WindowsPipePrefix.Length
                && endpoint.Length <= 256
                && endpoint.IndexOf('\0') < 0;
        return Path.IsPathFullyQualified(endpoint) && endpoint.Length <= 100;
    }

    internal static async ValueTask<Stream> ConnectAsync(
        string endpoint,
        CancellationToken cancellationToken)
    {
        if (OperatingSystem.IsWindows())
        {
            var pipeName = endpoint[WindowsPipePrefix.Length..];
            var pipe = new NamedPipeClientStream(
                ".",
                pipeName,
                PipeDirection.InOut,
                PipeOptions.Asynchronous | PipeOptions.WriteThrough);
            try
            {
                await pipe.ConnectAsync(cancellationToken).ConfigureAwait(false);
                return pipe;
            }
            catch
            {
                await pipe.DisposeAsync().ConfigureAwait(false);
                throw;
            }
        }

        var socket = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
        try
        {
            await socket.ConnectAsync(new UnixDomainSocketEndPoint(endpoint), cancellationToken)
                .ConfigureAwait(false);
            return new NetworkStream(socket, ownsSocket: true);
        }
        catch
        {
            socket.Dispose();
            throw;
        }
    }
}
