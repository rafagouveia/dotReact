using System.Reflection;
using System.Runtime.Loader;
using System.Text;
using DotReact.TypeGen;

return Run(args);

static int Run(string[] args)
{
    if (args.Length < 2 || args.Contains("--help", StringComparer.Ordinal))
    {
        Console.Error.WriteLine(
            "Usage: dotreact-typegen <assembly> <contracts.ts> [full.type.name ...] " +
            "[--assembly <feature.dll> ...] [--discover] [--manifest <backend.json>] " +
            "[--actions <actions.ts>] [--check]");
        return args.Contains("--help", StringComparer.Ordinal) ? 0 : 2;
    }

    try
    {
        var options = ParseOptions(args);
        foreach (var path in options.AssemblyPaths)
            if (!File.Exists(path))
                throw new FileNotFoundException($"Assembly not found: {path}", path);

        var loadContext = new AssemblyLoadContext("DotReact.TypeGen.Input", isCollectible: true);
        var assemblyDirectories = options.AssemblyPaths.Select(Path.GetDirectoryName)
            .Where(path => path is not null).Cast<string>().Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        loadContext.Resolving += (_, name) => ResolveDependency(
            loadContext, assemblyDirectories, name);
        try
        {
            var assemblies = options.AssemblyPaths.Select(loadContext.LoadFromAssemblyPath).ToArray();
            var explicitTypes = options.TypeNames.Select(name => FindType(assemblies, name));

            var backendGenerator = new DotReactBackendGenerator();
            var backend = options.Discover
                ? backendGenerator.Discover(assemblies)
                : new DotReactBackendContract([], []);
            var types = explicitTypes.Concat(backend.ContractTypes).Distinct().ToArray();
            if (types.Length == 0)
                throw new TypeScriptGenerationException(
                    "No contract types were provided or discovered. Add type names or use annotated DotReact pages/actions.");

            var contracts = new TypeScriptGenerator().Generate(types);
            WriteOrCheck(options.ContractsPath, contracts, options.Check, "TypeScript contracts");

            if (options.ManifestPath is not null)
                WriteOrCheck(options.ManifestPath, backendGenerator.GenerateManifest(backend), options.Check,
                    "DotReact backend manifest");

            if (options.ActionsPath is not null)
            {
                var import = GetTypeScriptImport(options.ActionsPath, options.ContractsPath);
                WriteOrCheck(options.ActionsPath,
                    backendGenerator.GenerateActionClient(backend, import), options.Check,
                    "DotReact action client");
            }

            Console.WriteLine(options.Check
                ? $"DotReact generated files are up to date: {options.ContractsPath}"
                : $"Generated {types.Length} root type(s) at {options.ContractsPath}");
            return 0;
        }
        finally
        {
            loadContext.Unload();
        }
    }
    catch (Exception exception) when (exception is not OutOfMemoryException and not StackOverflowException)
    {
        Console.Error.WriteLine($"dotreact-typegen: {exception.Message}");
        return 1;
    }
}

static GeneratorOptions ParseOptions(string[] args)
{
    var assembly = Path.GetFullPath(args[0]);
    var contracts = Path.GetFullPath(args[1]);
    var types = new List<string>();
    var additionalAssemblies = new List<string>();
    string? manifest = null;
    string? actions = null;
    var discover = false;
    var check = false;
    for (var index = 2; index < args.Length; index++)
    {
        switch (args[index])
        {
            case "--discover":
                discover = true;
                break;
            case "--check":
                check = true;
                break;
            case "--manifest":
                manifest = Path.GetFullPath(ReadValue(args, ref index, "--manifest"));
                break;
            case "--actions":
                actions = Path.GetFullPath(ReadValue(args, ref index, "--actions"));
                break;
            case "--assembly":
                additionalAssemblies.Add(Path.GetFullPath(ReadValue(args, ref index, "--assembly")));
                break;
            default:
                if (args[index].StartsWith("--", StringComparison.Ordinal))
                    throw new TypeScriptGenerationException($"Unknown option '{args[index]}'.");
                types.Add(args[index]);
                break;
        }
    }

    if ((manifest is not null || actions is not null) && !discover)
        throw new TypeScriptGenerationException("--manifest and --actions require --discover.");
    return new GeneratorOptions([assembly, .. additionalAssemblies.Distinct(StringComparer.OrdinalIgnoreCase)],
        contracts, types.Distinct(StringComparer.Ordinal).ToArray(),
        discover, manifest, actions, check);
}

static Type FindType(IReadOnlyList<Assembly> assemblies, string name)
{
    var matches = assemblies.Select(assembly => assembly.GetType(name, false, false))
        .Where(type => type is not null).Cast<Type>().ToArray();
    return matches.Length switch
    {
        1 => matches[0],
        0 => throw new TypeScriptGenerationException(
            $"Type '{name}' was not found in any input assembly."),
        _ => throw new TypeScriptGenerationException(
            $"Type '{name}' is ambiguous across input assemblies.")
    };
}

static string ReadValue(string[] args, ref int index, string option)
{
    index++;
    if (index >= args.Length || args[index].StartsWith("--", StringComparison.Ordinal))
        throw new TypeScriptGenerationException($"{option} requires a path.");
    return args[index];
}

static void WriteOrCheck(string path, string content, bool check, string description)
{
    if (check)
    {
        if (!File.Exists(path) || File.ReadAllText(path, Encoding.UTF8) != content)
            throw new TypeScriptGenerationException($"{description} is out of date: {path}");
        return;
    }

    Directory.CreateDirectory(Path.GetDirectoryName(path)!);
    File.WriteAllText(path, content, new UTF8Encoding(false));
}

static string GetTypeScriptImport(string fromFile, string importedFile)
{
    var importedWithoutExtension = Path.Combine(
        Path.GetDirectoryName(importedFile)!, Path.GetFileNameWithoutExtension(importedFile));
    var relative = Path.GetRelativePath(Path.GetDirectoryName(fromFile)!, importedWithoutExtension)
        .Replace('\\', '/');
    return relative.StartsWith(".", StringComparison.Ordinal) ? relative : $"./{relative}";
}

static Assembly? ResolveDependency(
    AssemblyLoadContext context,
    IReadOnlyList<string> directories,
    AssemblyName name)
{
    foreach (var directory in directories)
    {
        var candidate = Path.Combine(directory, $"{name.Name}.dll");
        if (File.Exists(candidate))
            return context.LoadFromAssemblyPath(candidate);
    }
    try
    {
        return AssemblyLoadContext.Default.LoadFromAssemblyName(name);
    }
    catch (FileNotFoundException)
    {
        return null;
    }
}

internal sealed record GeneratorOptions(
    IReadOnlyList<string> AssemblyPaths,
    string ContractsPath,
    IReadOnlyList<string> TypeNames,
    bool Discover,
    string? ManifestPath,
    string? ActionsPath,
    bool Check);
