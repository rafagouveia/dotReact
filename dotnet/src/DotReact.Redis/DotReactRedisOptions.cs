namespace DotReact.Redis;

/// <summary>Production bounds and namespacing for DotReact Redis stores.</summary>
public sealed class DotReactRedisOptions
{
    /// <summary>Prefix isolating this application from other Redis consumers.</summary>
    public string KeyPrefix { get; set; } = "dotreact";

    /// <summary>How often idempotency waiters check for a completed response.</summary>
    public TimeSpan IdempotencyPollInterval { get; set; } = TimeSpan.FromMilliseconds(25);

    /// <summary>Renewable lease used to elect one Server Action executor across replicas.</summary>
    public TimeSpan IdempotencyLockLease { get; set; } = TimeSpan.FromSeconds(30);

    /// <summary>Additional retention for expired ISR artifacts, enabling stale-on-error recovery.</summary>
    public TimeSpan ArtifactRetentionAfterStale { get; set; } = TimeSpan.FromDays(1);

    /// <summary>
    /// Maximum retention for build-scoped static artifacts. A later request can regenerate an artifact after
    /// this bound; the bound prevents abandoned deployment builds from accumulating indefinitely.
    /// </summary>
    public TimeSpan StaticArtifactRetention { get; set; } = TimeSpan.FromDays(30);

    /// <summary>Retention for all-device session revocation markers.</summary>
    public TimeSpan SessionRevocationRetention { get; set; } = TimeSpan.FromDays(31);
}
