using DotReact.AspNetCore;
using DotReact.AspNetCore.Authentication;
using DotReact.Redis;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using StackExchange.Redis;
using Xunit;

namespace DotReact.AspNetCore.Tests;

public sealed class DotReactRedisRegistrationTests
{
    [Fact]
    public async Task Redis_stores_coordinate_real_cross_replica_replay_and_prerender_invalidation()
    {
        var endpoint = Environment.GetEnvironmentVariable("DOTREACT_TEST_REDIS");
        Assert.SkipWhen(string.IsNullOrWhiteSpace(endpoint), "DOTREACT_TEST_REDIS is not configured.");
        var configuration = ConfigurationOptions.Parse(endpoint!);
        configuration.AllowAdmin = true;
        configuration.AbortOnConnectFail = true;
        var services = new ServiceCollection();
        services.AddDotReact();
        services.AddDotReactRedis(configuration, options => options.KeyPrefix = "dotreact-tests");
        await using var provider = services.BuildServiceProvider();
        var connection = provider.GetRequiredService<IConnectionMultiplexer>();
        var server = connection.GetServer(connection.GetEndPoints().Single());
        await server.FlushDatabaseAsync();

        try
        {
            var prerender = provider.GetRequiredService<IDotReactPrerenderStore>();
            var generatedAt = DateTimeOffset.UtcNow;
            var first = DotReactPrerenderArtifact.Create(
                new DotReactPrerenderKey("build-1", "/products/1"), "<html>one</html>", generatedAt,
                TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(1), ["products"]);
            var second = DotReactPrerenderArtifact.Create(
                new DotReactPrerenderKey("build-1", "/products/2"), "<html>two</html>", generatedAt,
                TimeSpan.FromMinutes(1), TimeSpan.FromMinutes(1), ["products"]);
            await prerender.SetAsync(first);
            await prerender.SetAsync(second);
            Assert.Equal(first.Html, (await prerender.GetAsync(first.Key))?.Html);
            Assert.Equal(2, await prerender.InvalidateTagAsync("build-1", "products"));
            Assert.Null(await prerender.GetAsync(first.Key));
            Assert.Null(await prerender.GetAsync(second.Key));

            var executions = 0;
            var idempotency = provider.GetRequiredService<IDotReactActionIdempotencyStore>();
            async ValueTask<DotReactStoredActionResponse> Execute(CancellationToken cancellationToken)
            {
                Interlocked.Increment(ref executions);
                await Task.Delay(75, cancellationToken);
                return new DotReactStoredActionResponse(200, "application/json", [1, 2, 3], ["/products"]);
            }
            var calls = await Task.WhenAll(
                idempotency.ExecuteAsync("action:user", "request-12345678", "fingerprint-a",
                    TimeSpan.FromMinutes(1), Execute, CancellationToken.None).AsTask(),
                idempotency.ExecuteAsync("action:user", "request-12345678", "fingerprint-a",
                    TimeSpan.FromMinutes(1), Execute, CancellationToken.None).AsTask());
            Assert.Equal(1, executions);
            Assert.Single(calls, call => call.Replayed);
            Assert.Single(calls, call => !call.Replayed);
            Assert.All(calls, call => Assert.Equal(new byte[] { 1, 2, 3 }, call.Response?.Body));
            var conflict = await idempotency.ExecuteAsync(
                "action:user", "request-12345678", "fingerprint-b", TimeSpan.FromMinutes(1), Execute,
                CancellationToken.None);
            Assert.True(conflict.FingerprintConflict);
            Assert.Equal(1, executions);

            var sessions = provider.GetRequiredService<IDotReactSessionStore>();
            var issuedAt = DateTimeOffset.UtcNow;
            var registration = new DotReactSessionRegistration(
                "redis-session", "user-42", issuedAt, issuedAt.AddMinutes(10));
            await sessions.RegisterAsync(registration, CancellationToken.None);
            Assert.True(await sessions.IsActiveAsync(
                registration.SessionId, registration.Subject, registration.IssuedAt, CancellationToken.None));
            await sessions.RevokeAllAsync(registration.Subject, issuedAt.AddTicks(1), CancellationToken.None);
            Assert.False(await sessions.IsActiveAsync(
                registration.SessionId, registration.Subject, registration.IssuedAt, CancellationToken.None));
        }
        finally
        {
            await server.FlushDatabaseAsync();
        }
    }

    [Fact]
    public void Redis_plugin_replaces_only_the_shared_store_ports()
    {
        var services = new ServiceCollection();
        services.AddDotReact();
        services.AddDotReactRedis(ConfigurationOptions.Parse("127.0.0.1:6379,abortConnect=false"));

        Assert.Equal(typeof(RedisDotReactPrerenderStore),
            services.Last(descriptor => descriptor.ServiceType == typeof(IDotReactPrerenderStore)).ImplementationType);
        Assert.Equal(typeof(RedisDotReactActionIdempotencyStore),
            services.Last(descriptor => descriptor.ServiceType == typeof(IDotReactActionIdempotencyStore)).ImplementationType);
        Assert.Equal(typeof(RedisDotReactSessionStore),
            services.Last(descriptor => descriptor.ServiceType == typeof(IDotReactSessionStore)).ImplementationType);
    }

    [Fact]
    public void Redis_plugin_rejects_unsafe_key_namespaces_before_connecting()
    {
        var services = new ServiceCollection();
        services.AddDotReact();
        services.AddDotReactRedis(
            ConfigurationOptions.Parse("127.0.0.1:6379,abortConnect=false"),
            options => options.KeyPrefix = "unsafe:prefix");
        using var provider = services.BuildServiceProvider();

        Assert.Throws<OptionsValidationException>(() =>
            provider.GetRequiredService<IOptions<DotReactRedisOptions>>().Value);
    }

    [Fact]
    public void Redis_plugin_rejects_unbounded_static_artifact_retention_before_connecting()
    {
        var services = new ServiceCollection();
        services.AddDotReact();
        services.AddDotReactRedis(
            ConfigurationOptions.Parse("127.0.0.1:6379,abortConnect=false"),
            options => options.StaticArtifactRetention = TimeSpan.FromDays(366));
        using var provider = services.BuildServiceProvider();

        Assert.Throws<OptionsValidationException>(() =>
            provider.GetRequiredService<IOptions<DotReactRedisOptions>>().Value);
    }
}
