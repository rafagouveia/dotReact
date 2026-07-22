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
        Assert.True(first.UseBinaryRendererTransport);
        Assert.True(first.UseFramedRendererTransport);
        Assert.True(DotReactRendererInterprocessEndpoint.IsValid(first.RendererSocketPath));
        Assert.True(DotReactRendererInterprocessEndpoint.IsValid(first.RendererFrameSocketPath));
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

    [Fact]
    public void Renderer_process_receives_only_platform_public_and_framework_environment()
    {
        const string secretName = "DOTREACT_TEST_DATABASE_PASSWORD";
        var original = Environment.GetEnvironmentVariable(secretName);
        Environment.SetEnvironmentVariable(secretName, "must-not-cross-the-process-boundary");
        try
        {
            var options = new DotReactNodeRendererOptions
            {
                ExecutablePath = "node",
                ScriptPath = "renderer.js",
                ServerEntryPath = "entry-server.js",
                WorkingDirectory = AppContext.BaseDirectory,
                Port = 6123
            };
            options.PublicEnvironmentVariables["PUBLIC_API_ORIGIN"] = "https://api.example.test";

            var startInfo = DotReactNodeRendererEnvironment.CreateStartInfo(options, "managed-token");

            Assert.False(startInfo.Environment.ContainsKey(secretName));
            Assert.Equal("https://api.example.test", startInfo.Environment["PUBLIC_API_ORIGIN"]);
            Assert.Equal("production", startInfo.Environment["NODE_ENV"]);
            Assert.Equal("managed-token", startInfo.Environment["DOTREACT_RENDERER_TOKEN"]);
            Assert.Equal(options.WorkerCount.ToString(System.Globalization.CultureInfo.InvariantCulture),
                startInfo.Environment["DOTREACT_RENDERER_WORKERS"]);
            Assert.Equal(options.FrameSocketPath, startInfo.Environment["DOTREACT_RENDERER_FRAME_SOCKET"]);
        }
        finally
        {
            Environment.SetEnvironmentVariable(secretName, original);
        }
    }

    [Fact]
    public void Renderer_process_receives_the_managed_socket_only_when_enabled()
    {
        var socket = Path.Combine(Path.GetTempPath(), "dotreact-renderer-test.sock");
        var options = new DotReactNodeRendererOptions
        {
            ScriptPath = "renderer.js",
            ServerEntryPath = "entry-server.js",
            UseInterprocessSocket = true,
            SocketPath = socket
        };

        var startInfo = DotReactNodeRendererEnvironment.CreateStartInfo(options, "managed-token");

        Assert.Equal(socket, startInfo.Environment["DOTREACT_RENDERER_SOCKET"]);
    }

    [Fact]
    public void Managed_renderer_defaults_to_a_platform_native_interprocess_endpoint()
    {
        var options = new DotReactNodeRendererOptions();

        Assert.True(options.UseInterprocessSocket);
        Assert.True(options.UseFramedTransport);
        Assert.True(DotReactRendererInterprocessEndpoint.IsValid(options.SocketPath));
        Assert.True(DotReactRendererInterprocessEndpoint.IsValid(options.FrameSocketPath));
        if (OperatingSystem.IsWindows())
            Assert.StartsWith(@"\\.\pipe\dotreact-renderer-", options.SocketPath, StringComparison.OrdinalIgnoreCase);
        else
            Assert.EndsWith(".sock", options.SocketPath, StringComparison.Ordinal);
    }

    [Fact]
    public void Invalid_platform_interprocess_endpoint_fails_options_validation()
    {
        var services = new ServiceCollection();
        services.AddDotReactNodeRenderer(options =>
        {
            options.ScriptPath = "renderer.js";
            options.ServerEntryPath = "entry-server.js";
            options.UseInterprocessSocket = true;
            options.SocketPath = "relative-or-invalid";
        });
        using var provider = services.BuildServiceProvider();

        Assert.Throws<OptionsValidationException>(() =>
            provider.GetRequiredService<IOptions<DotReactNodeRendererOptions>>().Value);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(33)]
    public void Invalid_worker_count_fails_options_validation(int workerCount)
    {
        var services = new ServiceCollection();
        services.AddDotReactNodeRenderer(options =>
        {
            options.ScriptPath = "renderer.js";
            options.ServerEntryPath = "entry-server.js";
            options.WorkerCount = workerCount;
        });
        using var provider = services.BuildServiceProvider();

        Assert.Throws<OptionsValidationException>(() =>
            provider.GetRequiredService<IOptions<DotReactNodeRendererOptions>>().Value);
    }

    [Theory]
    [InlineData("NODE_OPTIONS")]
    [InlineData("DOTREACT_RENDERER_TOKEN")]
    [InlineData("BAD-NAME")]
    public void Reserved_or_invalid_public_renderer_environment_fails_validation(string name)
    {
        var services = new ServiceCollection();
        services.AddDotReactNodeRenderer(options =>
        {
            options.ScriptPath = "renderer.js";
            options.ServerEntryPath = "entry-server.js";
            options.PublicEnvironmentVariables[name] = "value";
        });
        using var provider = services.BuildServiceProvider();

        Assert.Throws<OptionsValidationException>(() =>
            provider.GetRequiredService<IOptions<DotReactNodeRendererOptions>>().Value);
    }
}
