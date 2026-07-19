using DotReact.AspNetCore;
using DotReact.TypeGen;
using Xunit;

namespace DotReact.TypeGen.Tests;

public sealed class MultiAssemblyDiscoveryTests
{
    [Fact]
    public void Discovers_contracts_across_multiple_assemblies_deterministically()
    {
        var generator = new DotReactBackendGenerator();
        var singleAssembly = generator.Discover(typeof(MultiAssemblyDiscoveryTests).Assembly);

        var contract = generator.Discover([
            typeof(MultiAssemblyDiscoveryTests).Assembly,
            typeof(DotReactPageAttribute).Assembly
        ]);

        Assert.Equal(generator.GenerateManifest(singleAssembly), generator.GenerateManifest(contract));
        Assert.Equal(contract.Pages.OrderBy(page => page.ModuleId), contract.Pages);
        Assert.Equal(contract.Actions.OrderBy(action => action.Id), contract.Actions);
    }
}
