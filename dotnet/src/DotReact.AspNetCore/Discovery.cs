using System.Reflection;

namespace DotReact.AspNetCore;

internal sealed record DotReactPageDescriptor(
    Type ImplementationType,
    Type PropsType,
    string Pattern,
    string ModuleId,
    bool ReturnsResult,
    DotReactPrerenderMetadata? Prerender);

internal sealed record DotReactActionDescriptor(
    Type ImplementationType,
    Type RequestType,
    Type ResponseType,
    string Id);

internal sealed class DotReactPageRegistry
{
    public List<DotReactPageDescriptor> Items { get; } = [];
}

internal sealed class DotReactActionRegistry
{
    public List<DotReactActionDescriptor> Items { get; } = [];
}

internal static class DotReactDiscovery
{
    public static IEnumerable<(Type Type, Type Contract, TAttribute Attribute)> Find<TAttribute>(
        Assembly assembly,
        params Type[] openContracts) where TAttribute : Attribute
    {
        ArgumentNullException.ThrowIfNull(openContracts);
        if (openContracts.Length == 0)
            throw new ArgumentException("At least one open contract is required.", nameof(openContracts));

        foreach (var type in assembly.DefinedTypes.Where(type => type is { IsClass: true, IsAbstract: false }))
        {
            var attribute = type.GetCustomAttribute<TAttribute>(inherit: false);
            if (attribute is null)
            {
                continue;
            }

            var contracts = type.ImplementedInterfaces
                .Where(candidate => candidate.IsGenericType
                    && openContracts.Contains(candidate.GetGenericTypeDefinition()))
                .ToArray();
            if (contracts.Length != 1)
            {
                throw new InvalidOperationException(
                    $"Discovered type '{type.FullName}' must implement exactly one supported DotReact contract.");
            }

            yield return (type.AsType(), contracts[0], attribute);
        }
    }
}
