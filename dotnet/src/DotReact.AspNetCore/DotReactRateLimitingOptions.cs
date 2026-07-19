namespace DotReact.AspNetCore;

/// <summary>Configures the opt-in fixed-window policy for DotReact Server Actions.</summary>
public sealed class DotReactRateLimitingOptions
{
    /// <summary>Maximum actions accepted per partition and window.</summary>
    public int PermitLimit { get; set; } = 120;

    /// <summary>Fixed-window duration.</summary>
    public TimeSpan Window { get; set; } = TimeSpan.FromMinutes(1);

    /// <summary>Maximum queued requests. Zero rejects excess work immediately.</summary>
    public int QueueLimit { get; set; }

    /// <summary>Partitions authenticated requests by subject/name; anonymous requests share one partition.</summary>
    public bool PartitionAuthenticatedUsers { get; set; } = true;
}
