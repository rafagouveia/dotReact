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
    /// <summary>Maximum time allowed for renderer readiness.</summary>
    public TimeSpan StartupTimeout { get; set; } = TimeSpan.FromSeconds(30);
    /// <summary>Maximum graceful drain time.</summary>
    public TimeSpan ShutdownTimeout { get; set; } = TimeSpan.FromSeconds(10);
    /// <summary>Maximum Node V8 heap size in MiB.</summary>
    public int NodeMemoryMb { get; set; } = 384;
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
