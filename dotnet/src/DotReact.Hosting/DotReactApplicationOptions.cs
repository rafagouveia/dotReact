using System.Reflection;
using DotReact.AspNetCore;

namespace DotReact.Hosting;

/// <summary>Advanced overrides for the convention-based DotReact application host.</summary>
public sealed class DotReactApplicationOptions
{
    /// <summary>Overrides the entry assembly used for page and action discovery.</summary>
    public Assembly? ApplicationAssembly { get; set; }

    /// <summary>Additional assemblies containing pages, actions and static-path providers.</summary>
    public ICollection<Assembly> FeatureAssemblies { get; } = [];

    /// <summary>Port used by the private production renderer supervised by ASP.NET Core.</summary>
    public int ProductionRendererPort { get; set; } = 5178;

    /// <summary>Applies advanced overrides after the safe runtime defaults.</summary>
    public Action<DotReactOptions>? ConfigureRuntime { get; set; }

    /// <summary>Applies advanced overrides to the managed production Node renderer.</summary>
    public Action<DotReactNodeRendererOptions>? ConfigureNodeRenderer { get; set; }
}
