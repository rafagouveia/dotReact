using System.Security.Cryptography;
using Microsoft.AspNetCore.Http;

namespace DotReact.AspNetCore;

/// <summary>Provides the request-scoped nonce used by DotReact document scripts.</summary>
public static class DotReactSecurityNonce
{
    private static readonly object ItemKey = new();
    private static readonly object EnabledKey = new();

    /// <summary>Returns the nonce established by <c>UseDotReactSecurityHeaders</c>, when enabled.</summary>
    public static string? Get(HttpContext context)
    {
        ArgumentNullException.ThrowIfNull(context);
        if (context.Items.TryGetValue(ItemKey, out var value)) return value as string;
        if (!context.Items.ContainsKey(EnabledKey)) return null;
        var nonce = Convert.ToBase64String(RandomNumberGenerator.GetBytes(24));
        context.Items[ItemKey] = nonce;
        return nonce;
    }

    internal static void Enable(HttpContext context) => context.Items[EnabledKey] = true;

    internal static string? Peek(HttpContext context) =>
        context.Items.TryGetValue(ItemKey, out var value) ? value as string : null;
}
