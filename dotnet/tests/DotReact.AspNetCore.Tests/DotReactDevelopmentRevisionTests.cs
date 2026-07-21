using DotReact.AspNetCore;
using Xunit;

namespace DotReact.AspNetCore.Tests;

public sealed class DotReactDevelopmentRevisionTests
{
    [Fact]
    public async Task WaitForChangeCompletesAfterMetadataUpdate()
    {
        var observed = DotReactDevelopmentRevision.Current;
        var pending = DotReactDevelopmentRevision.WaitForChangeAsync(observed).AsTask();

        Assert.False(pending.IsCompleted);
        DotReactDevelopmentRevision.UpdateApplication(null);

        var changed = await pending.WaitAsync(TimeSpan.FromSeconds(1));
        Assert.True(changed > observed);
    }

    [Fact]
    public async Task WaitForChangeReturnsImmediatelyForStaleRevision()
    {
        DotReactDevelopmentRevision.UpdateApplication(null);
        var current = DotReactDevelopmentRevision.Current;

        var changed = await DotReactDevelopmentRevision.WaitForChangeAsync(current - 1);

        Assert.Equal(current, changed);
    }

    [Fact]
    public async Task MetadataUpdateRecoversWhenHotReloadClearsTheSignalField()
    {
        var signal = typeof(DotReactDevelopmentRevision).GetField(
            "_changed",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Static);
        Assert.NotNull(signal);
        signal.SetValue(null, null);
        var observed = DotReactDevelopmentRevision.Current;
        var pending = DotReactDevelopmentRevision.WaitForChangeAsync(observed).AsTask();

        DotReactDevelopmentRevision.UpdateApplication(null);

        Assert.True(await pending.WaitAsync(TimeSpan.FromSeconds(1)) > observed);
    }
}
