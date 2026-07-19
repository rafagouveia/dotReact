namespace DotReact.AspNetCore;

/// <summary>
/// Loads the domain resource used by a resource-based authorization policy for a server action.
/// The resource is resolved after request binding and before the action executes.
/// </summary>
public interface IDotReactActionResourceProvider<in TRequest>
{
    /// <summary>Loads the resource that the current user is attempting to access.</summary>
    ValueTask<object?> LoadAuthorizationResourceAsync(
        TRequest request,
        CancellationToken cancellationToken);
}

/// <summary>Requires a named ASP.NET Core policy to succeed against a loaded action resource.</summary>
[AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = true)]
public sealed class DotReactAuthorizeResourceAttribute : Attribute
{
    /// <summary>Creates a resource-policy declaration.</summary>
    public DotReactAuthorizeResourceAttribute(string policy)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(policy);
        Policy = policy;
    }

    /// <summary>The ASP.NET Core authorization policy evaluated with the loaded domain resource.</summary>
    public string Policy { get; }
}
