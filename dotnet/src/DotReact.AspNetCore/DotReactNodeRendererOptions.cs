namespace DotReact.AspNetCore;

/// <summary>Configures a production Node renderer supervised by the ASP.NET Core host.</summary>
public sealed class DotReactNodeRendererOptions
{
    /// <summary>Node executable path.</summary>
    public string ExecutablePath { get; set; } = "node";
    /// <summary>Compiled DotReact production renderer script.</summary>
    public string ScriptPath { get; set; } = string.Empty;
    /// <summary>Compiled application SSR entry.</summary>
    public string ServerEntryPath { get; set; } = string.Empty;
    /// <summary>Child process working directory.</summary>
    public string WorkingDirectory { get; set; } = AppContext.BaseDirectory;
    /// <summary>Loopback renderer port.</summary>
    public int Port { get; set; } = 5178;
    /// <summary>Uses a named pipe on Windows or a Unix-domain socket on Linux/macOS, avoiding the TCP stack.</summary>
    public bool UseInterprocessSocket { get; set; } = true;
    /// <summary>Private named-pipe or Unix-domain socket endpoint owned by the managed renderer.</summary>
    public string SocketPath { get; set; } = DotReactRendererInterprocessEndpoint.CreateDefault();
    /// <summary>Private endpoint for persistent multiplexed buffered render frames.</summary>
    public string FrameSocketPath { get; set; } = DotReactRendererInterprocessEndpoint.CreateDefault("frames");
    /// <summary>Maximum time allowed for renderer readiness.</summary>
    public TimeSpan StartupTimeout { get; set; } = TimeSpan.FromSeconds(30);
    /// <summary>Maximum graceful drain time.</summary>
    public TimeSpan ShutdownTimeout { get; set; } = TimeSpan.FromSeconds(10);
    /// <summary>Maximum Node V8 heap size in MiB.</summary>
    public int NodeMemoryMb { get; set; } = 384;
    /// <summary>
    /// Number of isolated renderer workers sharing the loopback port. The default uses the
    /// allocated CPU count, capped to keep memory bounded on large hosts.
    /// </summary>
    public int WorkerCount { get; set; } = Math.Clamp(Environment.ProcessorCount, 1, 4);
    /// <summary>Maximum concurrent React renders accepted by each isolated worker.</summary>
    public int MaxConcurrencyPerWorker { get; set; } = 32;
    /// <summary>Uses the compact binary protocol for buffered SSR while retaining HTTP JSON fallback.</summary>
    public bool UseBinaryTransport { get; set; } = true;
    /// <summary>Uses persistent framed IPC for buffered SSR. HTTP remains available for lifecycle and streaming.</summary>
    public bool UseFramedTransport { get; set; } = true;
    /// <summary>Maximum unexpected restarts permitted inside <see cref="RestartWindow"/>.</summary>
    public int MaxRestarts { get; set; } = 3;
    /// <summary>Rolling window used to limit crash-loop restarts.</summary>
    public TimeSpan RestartWindow { get; set; } = TimeSpan.FromMinutes(5);
    /// <summary>Initial delay before restarting an unexpectedly terminated renderer.</summary>
    public TimeSpan RestartBackoff { get; set; } = TimeSpan.FromSeconds(1);
    /// <summary>
    /// Explicit non-secret values exposed to the isolated Node renderer. The renderer never inherits the
    /// ASP.NET Core host environment, so connection strings, credentials and cloud identity variables stay private.
    /// </summary>
    public IDictionary<string, string> PublicEnvironmentVariables { get; } =
        new Dictionary<string, string>(StringComparer.Ordinal);
}
