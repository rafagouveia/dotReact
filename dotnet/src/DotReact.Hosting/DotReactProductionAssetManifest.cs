using System.Text.Json;
using DotReact.AspNetCore;

namespace DotReact.Hosting;

internal static class DotReactProductionAssetManifest
{
    private const long MaxManifestBytes = 4 * 1024 * 1024;

    public static IReadOnlyDictionary<string, DotReactClientRouteAssets> Load(string clientRoot)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(clientRoot);
        var manifestPath = Path.Combine(clientRoot, ".vite", "manifest.json");
        var routesPath = Path.Combine(clientRoot, ".vite", "dotreact-routes.json");
        if (!File.Exists(manifestPath) || !File.Exists(routesPath))
            throw new InvalidOperationException(
                "DotReact production client manifests were not found. Run the Vite client build before publishing.");
        using var manifest = ParseBounded(manifestPath);
        using var routes = ParseBounded(routesPath);
        if (!routes.RootElement.TryGetProperty("version", out var version)
            || version.GetInt32() is not (1 or 2)
            || !routes.RootElement.TryGetProperty("routes", out var routeArray)
            || routeArray.ValueKind != JsonValueKind.Array)
            throw new InvalidOperationException("DotReact route asset manifest has an unsupported schema.");

        var globalStyles = new List<string>();
        var globalPreloads = new List<string>();
        VisitEntry(
            manifest.RootElement,
            "virtual:dotreact/client-entry",
            new HashSet<string>(StringComparer.Ordinal),
            globalStyles,
            globalPreloads);

        var output = new Dictionary<string, DotReactClientRouteAssets>(StringComparer.Ordinal);
        foreach (var route in routeArray.EnumerateArray())
        {
            var moduleId = route.GetProperty("moduleId").GetString();
            if (string.IsNullOrWhiteSpace(moduleId) || moduleId.Length > 1_024
                || !route.TryGetProperty("modules", out var modules) || modules.ValueKind != JsonValueKind.Array)
                throw new InvalidOperationException("DotReact route asset manifest contains an invalid route.");
            var hydrate = version.GetInt32() == 1 || !route.TryGetProperty("hydrate", out var hydration)
                ? true
                : hydration.ValueKind is JsonValueKind.True or JsonValueKind.False
                    ? hydration.GetBoolean()
                    : throw new InvalidOperationException("DotReact route hydration mode must be a boolean.");
            var styles = new List<string>(globalStyles);
            var preloads = new List<string>(globalPreloads);
            var visited = new HashSet<string>(StringComparer.Ordinal);
            foreach (var module in modules.EnumerateArray())
            {
                var key = module.GetString()
                    ?? throw new InvalidOperationException("DotReact route asset module cannot be null.");
                VisitEntry(manifest.RootElement, key, visited, styles, preloads);
            }
            output.Add(moduleId, new(
                styles.Distinct(StringComparer.Ordinal).ToArray(),
                preloads.Distinct(StringComparer.Ordinal).ToArray(),
                hydrate));
        }
        return output;
    }

    private static void VisitEntry(
        JsonElement manifest,
        string key,
        HashSet<string> visited,
        List<string> styles,
        List<string> preloads)
    {
        if (!visited.Add(key)) return;
        if (!manifest.TryGetProperty(key, out var entry) || entry.ValueKind != JsonValueKind.Object)
            throw new InvalidOperationException($"Vite manifest entry '{key}' required by a DotReact route was not found.");
        if (entry.TryGetProperty("file", out var file) && file.ValueKind == JsonValueKind.String)
        {
            var path = file.GetString()!;
            if (path.EndsWith(".js", StringComparison.OrdinalIgnoreCase)) preloads.Add(ToPublicUrl(path));
        }
        if (entry.TryGetProperty("css", out var css) && css.ValueKind == JsonValueKind.Array)
            foreach (var item in css.EnumerateArray())
                styles.Add(ToPublicUrl(item.GetString()
                    ?? throw new InvalidOperationException("Vite CSS asset cannot be null.")));
        if (entry.TryGetProperty("imports", out var imports) && imports.ValueKind == JsonValueKind.Array)
            foreach (var import in imports.EnumerateArray()) VisitEntry(
                manifest,
                import.GetString() ?? throw new InvalidOperationException("Vite manifest import cannot be null."),
                visited,
                styles,
                preloads);
    }

    private static string ToPublicUrl(string path)
    {
        if (path.Length is 0 or > 2_048 || path.StartsWith('/') || path.StartsWith("//", StringComparison.Ordinal)
            || path.Contains('\\') || path.Any(char.IsControl)
            || path.Split('/').Any(segment => segment is "." or ".."))
            throw new InvalidOperationException("Vite manifest contains an unsafe client asset path.");
        return "/" + path;
    }

    private static JsonDocument ParseBounded(string path)
    {
        var info = new FileInfo(path);
        if (info.Length is <= 0 or > MaxManifestBytes)
            throw new InvalidOperationException($"DotReact client manifest '{info.Name}' exceeds its size limit.");
        try
        {
            return JsonDocument.Parse(File.ReadAllBytes(path), new JsonDocumentOptions { MaxDepth = 32 });
        }
        catch (JsonException exception)
        {
            throw new InvalidOperationException($"DotReact client manifest '{info.Name}' is invalid JSON.", exception);
        }
    }
}
