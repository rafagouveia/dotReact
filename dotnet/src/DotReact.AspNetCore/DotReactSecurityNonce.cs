using Microsoft.AspNetCore.Http;

namespace DotReact.AspNetCore;

/// <summary>Provides the request-scoped nonce used by DotReact document scripts.</summary>
public static class DotReactSecurityNonce
{
    private static readonly object ItemKey = new();

    /// <summary>Returns the nonce established by <c>UseDotReactSecurityHeaders</c>, when enabled.</summary>
    public static string? Get(HttpContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        return context.Items.TryGetValue(ItemKey, out var value) ? value as string : null;
    }

    internal static void Set(HttpContext context, string nonce) => context.Items[ItemKey] = nonce;
}
