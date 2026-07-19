using DotReact.AspNetCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Xunit;

namespace DotReact.AspNetCore.Tests;

public sealed class DotReactNodeRendererHostingTests
{
    [Fact]
    public void Managed_renderer_uses_loopback_and_an_ephemeral_high_entropy_token()
    {
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddDotReact();
        services.AddDotReactNodeRenderer(options =>
        {
            options.ScriptPath = "renderer.js";
            options.ServerEntryPath = "entry-server.js";
            options.Port = 6123;
        });

        using var provider = services.BuildServiceProvider();
        var first = provider.GetRequiredService<IOptions<DotReactOptions>>().Value;

        Assert.Equal(new Uri("http://127.0.0.1:6123"), first.RendererUrl);
        Assert.True(first.RequireRendererToken);
        Assert.NotNull(first.RendererToken);
        Assert.True(first.RendererToken.Length >= 64);

        var secondServices = new ServiceCollection();
        secondServices.AddLogging();
        secondServices.AddDotReact();
        secondServices.AddDotReactNodeRenderer(options =>
        {
            options.ScriptPath = "renderer.js";
            options.ServerEntryPath = "entry-server.js";
            options.Port = 6123;
        });
        using var secondProvider = secondServices.BuildServiceProvider();
        var second = secondProvider.GetRequiredService<IOptions<DotReactOptions>>().Value;

        Assert.NotEqual(first.RendererToken, second.RendererToken);
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(101)]
    public void Invalid_restart_limit_fails_options_validation(int maxRestarts)
    {
        var services = new ServiceCollection();
        services.AddDotReactNodeRenderer(options =>
        {
            options.ScriptPath = "renderer.js";
            options.ServerEntryPath = "entry-server.js";
            options.MaxRestarts = maxRestarts;
        });
        using var provider = services.BuildServiceProvider();

        Assert.Throws<OptionsValidationException>(() =>
            provider.GetRequiredService<IOptions<DotReactNodeRendererOptions>>().Value);
    }

    [Fact]
    public void Unsafe_restart_timing_fails_options_validation()
    {
        var services = new ServiceCollection();
        services.AddDotReactNodeRenderer(options =>
        {
            options.ScriptPath = "renderer.js";
            options.ServerEntryPath = "entry-server.js";
            options.RestartWindow = TimeSpan.Zero;
            options.RestartBackoff = TimeSpan.FromMinutes(2);
        });
        using var provider = services.BuildServiceProvider();

        Assert.Throws<OptionsValidationException>(() =>
            provider.GetRequiredService<IOptions<DotReactNodeRendererOptions>>().Value);
    }
}
