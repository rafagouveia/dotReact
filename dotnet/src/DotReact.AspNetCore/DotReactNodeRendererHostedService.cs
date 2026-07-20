using System.Diagnostics;
using System.Globalization;
using System.Net.Http.Headers;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace DotReact.AspNetCore;

internal sealed class DotReactNodeRendererHostedService(
    IOptions<DotReactNodeRendererOptions> options,
    DotReactManagedRendererCredentials credentials,
    IHostApplicationLifetime lifetime,
    ILogger<DotReactNodeRendererHostedService> logger) : IHostedService, IDisposable
{
    private const int MaximumLogLineLength = 16_384;
    private static readonly TimeSpan MaximumBackoff = TimeSpan.FromSeconds(30);
    private readonly HttpClient _lifecycleClient = new() { Timeout = TimeSpan.FromSeconds(2) };
    private readonly CancellationTokenSource _supervisionCancellation = new();
    private readonly Queue<DateTimeOffset> _restartHistory = new();
    private readonly List<Process> _retiredProcesses = [];
    private Process? _process;
    private Task? _supervisionTask;
    private volatile bool _stopping;

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        var value = options.Value;
        ValidateFiles(value);
        var process = StartProcess(value);
        _process = process;
        try
        {
            await WaitUntilReadyAsync(process, value, cancellationToken).ConfigureAwait(false);
        }
        catch
        {
            Terminate(process);
            throw;
        }

        _supervisionTask = SuperviseAsync(process, value, _supervisionCancellation.Token);
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        _stopping = true;
        await _supervisionCancellation.CancelAsync().ConfigureAwait(false);

        var process = _process;
        if (process is not null && !process.HasExited)
            await StopProcessAsync(process, options.Value, cancellationToken).ConfigureAwait(false);

        if (_supervisionTask is not null)
        {
            try { await _supervisionTask.ConfigureAwait(false); }
            catch (OperationCanceledException) { }
        }
    }

    private async Task SuperviseAsync(
        Process initialProcess,
        DotReactNodeRendererOptions value,
        CancellationToken cancellationToken)
    {
        var current = initialProcess;
        while (!cancellationToken.IsCancellationRequested)
        {
            try { await current.WaitForExitAsync(cancellationToken).ConfigureAwait(false); }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { return; }

            if (_stopping) return;
            DotReactNodeRendererMetrics.UnexpectedExits.Add(1);
            logger.LogWarning(
                "DotReact production renderer exited unexpectedly with code {ExitCode}.", current.ExitCode);
            _retiredProcesses.Add(current);

            while (!cancellationToken.IsCancellationRequested)
            {
                var restartNumber = ReserveRestart(value, DateTimeOffset.UtcNow);
                if (restartNumber is null)
                {
                    DotReactNodeRendererMetrics.RestartLimitExceeded.Add(1);
                    logger.LogCritical(
                        "DotReact renderer exceeded {MaxRestarts} restarts in {RestartWindow}; stopping the host for platform recovery.",
                        value.MaxRestarts, value.RestartWindow);
                    lifetime.StopApplication();
                    return;
                }

                DotReactNodeRendererMetrics.Restarts.Add(1);
                var delay = CalculateBackoff(value.RestartBackoff, restartNumber.Value);
                logger.LogWarning(
                    "Restarting DotReact renderer after {Backoff}; attempt {RestartAttempt} of {MaxRestarts} in the rolling window.",
                    delay, restartNumber.Value, value.MaxRestarts);
                try { await Task.Delay(delay, cancellationToken).ConfigureAwait(false); }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { return; }

                Process? replacement = null;
                try
                {
                    replacement = StartProcess(value);
                    _process = replacement;
                    await WaitUntilReadyAsync(replacement, value, cancellationToken).ConfigureAwait(false);
                    current = replacement;
                    break;
                }
                catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                {
                    if (replacement is not null)
                    {
                        _process = null;
                        Terminate(replacement);
                    }
                    return;
                }
                catch (Exception exception)
                {
                    if (replacement is not null)
                    {
                        _process = null;
                        Terminate(replacement);
                    }
                    logger.LogError(exception,
                        "DotReact renderer restart attempt {RestartAttempt} failed.", restartNumber.Value);
                }
            }
        }
    }

    private Process StartProcess(DotReactNodeRendererOptions value)
    {
        var startInfo = DotReactNodeRendererEnvironment.CreateStartInfo(value, credentials.Token);

        var process = new Process { StartInfo = startInfo, EnableRaisingEvents = true };
        process.OutputDataReceived += (_, eventArgs) => LogLine(eventArgs.Data, false);
        process.ErrorDataReceived += (_, eventArgs) => LogLine(eventArgs.Data, true);
        if (!process.Start())
        {
            process.Dispose();
            throw new InvalidOperationException("The DotReact Node renderer could not be started.");
        }
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
        return process;
    }

    private async Task WaitUntilReadyAsync(
        Process process,
        DotReactNodeRendererOptions value,
        CancellationToken cancellationToken)
    {
        var started = Stopwatch.GetTimestamp();
        using var startup = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        startup.CancelAfter(value.StartupTimeout);
        try
        {
            while (true)
            {
                if (process.HasExited)
                    throw new InvalidOperationException(
                        $"DotReact Node renderer exited during startup with code {process.ExitCode}.");
                try
                {
                    using var request = new HttpRequestMessage(HttpMethod.Get,
                        $"http://127.0.0.1:{value.Port}/__dotreact/ready");
                    request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", credentials.Token);
                    using var response = await _lifecycleClient.SendAsync(request, startup.Token).ConfigureAwait(false);
                    if (response.IsSuccessStatusCode)
                    {
                        var elapsed = Stopwatch.GetElapsedTime(started);
                        DotReactNodeRendererMetrics.StartupDuration.Record(elapsed.TotalSeconds);
                        logger.LogInformation(
                            "DotReact production renderer is ready on loopback port {Port} after {StartupDurationMs} ms.",
                            value.Port, elapsed.TotalMilliseconds);
                        return;
                    }
                }
                catch (HttpRequestException) { }
                catch (TaskCanceledException) when (!startup.IsCancellationRequested) { }
                await Task.Delay(100, startup.Token).ConfigureAwait(false);
            }
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            throw new TimeoutException("DotReact Node renderer did not become ready before the startup timeout.");
        }
    }

    private async Task StopProcessAsync(
        Process process,
        DotReactNodeRendererOptions value,
        CancellationToken cancellationToken)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post,
                $"http://127.0.0.1:{value.Port}/__dotreact/shutdown");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", credentials.Token);
            using var response = await _lifecycleClient.SendAsync(request, cancellationToken).ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is HttpRequestException or TaskCanceledException)
        {
            logger.LogWarning("DotReact renderer did not acknowledge graceful shutdown.");
        }

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(value.ShutdownTimeout);
        try { await process.WaitForExitAsync(timeout.Token).ConfigureAwait(false); }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning(
                "DotReact renderer exceeded its {ShutdownTimeout} shutdown timeout; terminating its process tree.",
                value.ShutdownTimeout);
            Terminate(process);
        }
    }

    private int? ReserveRestart(DotReactNodeRendererOptions value, DateTimeOffset now)
    {
        while (_restartHistory.TryPeek(out var oldest) && now - oldest >= value.RestartWindow)
            _restartHistory.Dequeue();
        if (_restartHistory.Count >= value.MaxRestarts) return null;
        _restartHistory.Enqueue(now);
        return _restartHistory.Count;
    }

    private static TimeSpan CalculateBackoff(TimeSpan initial, int attempt)
    {
        if (initial == TimeSpan.Zero) return TimeSpan.Zero;
        var multiplier = Math.Pow(2, Math.Clamp(attempt - 1, 0, 10));
        return TimeSpan.FromMilliseconds(Math.Min(initial.TotalMilliseconds * multiplier, MaximumBackoff.TotalMilliseconds));
    }

    private void LogLine(string? line, bool error)
    {
        if (string.IsNullOrEmpty(line)) return;
        var truncated = line.Length <= MaximumLogLineLength ? line : line[..MaximumLogLineLength];
        var safe = truncated.Replace(credentials.Token, "[REDACTED]", StringComparison.Ordinal);
        if (error) logger.LogError("Node renderer: {RendererLogLine}", safe);
        else logger.LogInformation("Node renderer: {RendererLogLine}", safe);
    }

    private static void ValidateFiles(DotReactNodeRendererOptions value)
    {
        if (!File.Exists(value.ScriptPath))
            throw new FileNotFoundException("DotReact production renderer script was not found.", value.ScriptPath);
        if (!File.Exists(value.ServerEntryPath))
            throw new FileNotFoundException("DotReact SSR server entry was not found.", value.ServerEntryPath);
        if (!Directory.Exists(value.WorkingDirectory))
            throw new DirectoryNotFoundException("DotReact renderer working directory was not found.");
    }

    private static void Terminate(Process process)
    {
        try
        {
            if (!process.HasExited) process.Kill(entireProcessTree: true);
        }
        catch (InvalidOperationException) { }
        finally { process.Dispose(); }
    }

    public void Dispose()
    {
        _supervisionCancellation.Dispose();
        _lifecycleClient.Dispose();
        _process?.Dispose();
        foreach (var process in _retiredProcesses) process.Dispose();
    }
}

internal static class DotReactNodeRendererEnvironment
{
    private static readonly string[] PlatformVariables = OperatingSystem.IsWindows()
        ? ["SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "PATH", "TEMP", "TMP"]
        : ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ"];

    internal static ProcessStartInfo CreateStartInfo(DotReactNodeRendererOptions value, string token)
    {
        var startInfo = new ProcessStartInfo
        {
            FileName = value.ExecutablePath,
            WorkingDirectory = value.WorkingDirectory,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true
        };
        startInfo.ArgumentList.Add($"--max-old-space-size={value.NodeMemoryMb}");
        startInfo.ArgumentList.Add(value.ScriptPath);

        // ProcessStartInfo otherwise inherits every host variable, including database, Redis and cloud secrets.
        startInfo.Environment.Clear();
        foreach (var name in PlatformVariables)
        {
            if (Environment.GetEnvironmentVariable(name) is { Length: > 0 } platformValue)
                startInfo.Environment[name] = platformValue;
        }
        foreach (var (name, publicValue) in value.PublicEnvironmentVariables)
            startInfo.Environment[name] = publicValue;

        startInfo.Environment["NODE_ENV"] = "production";
        startInfo.Environment["DOTREACT_RENDERER_HOST"] = "127.0.0.1";
        startInfo.Environment["DOTREACT_RENDERER_PORT"] = value.Port.ToString(CultureInfo.InvariantCulture);
        startInfo.Environment["DOTREACT_RENDERER_TOKEN"] = token;
        startInfo.Environment["DOTREACT_SERVER_ENTRY"] = value.ServerEntryPath;
        return startInfo;
    }

    internal static bool IsSafePublicVariable(string name, string? value)
    {
        if (string.IsNullOrEmpty(name) || name.Length > 128 || value is null || value.Length > 4096
            || name.Equals("NODE_OPTIONS", StringComparison.OrdinalIgnoreCase)
            || name.StartsWith("DOTREACT_", StringComparison.OrdinalIgnoreCase)
            || value.IndexOf('\0') >= 0)
            return false;
        if (!(char.IsAsciiLetter(name[0]) || name[0] == '_')) return false;
        return name.All(static character => char.IsAsciiLetterOrDigit(character) || character == '_');
    }
}
