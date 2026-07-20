using System.Collections.Immutable;
using System.Text;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Text;

namespace DotReact.AppGenerator;

/// <summary>
/// Connects a co-located app-router C# loader to its DRX page without repeating a route string.
/// The generated assembly metadata is consumed by both ASP.NET Core discovery and TypeGen.
/// </summary>
[Generator(LanguageNames.CSharp)]
public sealed class DotReactAppGenerator : IIncrementalGenerator
{
    private const string PageInterface = "DotReact.AspNetCore.IDotReactPage<TProps>";
    private const string ResultPageInterface = "DotReact.AspNetCore.IDotReactResultPage<TProps>";
    private const string ExplicitPageAttribute = "DotReact.AspNetCore.DotReactPageAttribute";

    private static readonly DiagnosticDescriptor InvalidLocation = new(
        "DRXAPP001",
        "Invalid co-located page loader location",
        "DotReact page loader '{0}' must be named 'page.server.cs' below the configured app root",
        "DotReact.AppRouter",
        DiagnosticSeverity.Error,
        isEnabledByDefault: true);

    private static readonly DiagnosticDescriptor InvalidRoute = new(
        "DRXAPP002",
        "Invalid app-router path",
        "DotReact page loader '{0}' has an invalid app-router path: {1}",
        "DotReact.AppRouter",
        DiagnosticSeverity.Error,
        isEnabledByDefault: true);

    private static readonly DiagnosticDescriptor DuplicateRoute = new(
        "DRXAPP003",
        "Duplicate app-router page",
        "DotReact module ID '{0}' is produced by more than one co-located page loader",
        "DotReact.AppRouter",
        DiagnosticSeverity.Error,
        isEnabledByDefault: true);

    /// <inheritdoc />
    public void Initialize(IncrementalGeneratorInitializationContext context)
    {
        var candidates = context.SyntaxProvider.CreateSyntaxProvider(
                static (node, _) => node is ClassDeclarationSyntax,
                static (syntaxContext, cancellationToken) => CreateCandidate(syntaxContext, cancellationToken))
            .Where(static candidate => candidate is not null)
            .Select(static (candidate, _) => candidate!);

        var appRoot = context.AnalyzerConfigOptionsProvider.Select(static (options, _) =>
            options.GlobalOptions.TryGetValue("build_property.DotReactAppRoot", out var value)
                ? Normalize(value)
                : null);

        context.RegisterSourceOutput(candidates.Collect().Combine(appRoot), static (productionContext, input) =>
            Emit(productionContext, input.Left, input.Right));
    }

    private static PageCandidate? CreateCandidate(GeneratorSyntaxContext context, CancellationToken cancellationToken)
    {
        var declaration = (ClassDeclarationSyntax)context.Node;
        if (context.SemanticModel.GetDeclaredSymbol(declaration, cancellationToken) is not INamedTypeSymbol symbol
            || symbol.IsAbstract)
            return null;

        var pageContracts = symbol.AllInterfaces.Count(candidate =>
            candidate.OriginalDefinition.ToDisplayString() is PageInterface or ResultPageInterface);
        if (pageContracts == 0) return null;

        var explicitRegistration = symbol.GetAttributes().Any(attribute =>
            attribute.AttributeClass?.ToDisplayString() == ExplicitPageAttribute);
        return new(
            symbol.ToDisplayString(SymbolDisplayFormat.FullyQualifiedFormat),
            Normalize(declaration.SyntaxTree.FilePath),
            declaration.Identifier.GetLocation(),
            pageContracts,
            explicitRegistration);
    }

    private static void Emit(
        SourceProductionContext context,
        ImmutableArray<PageCandidate> candidates,
        string? configuredAppRoot)
    {
        var registrations = new List<PageRegistration>();
        foreach (var candidate in candidates)
        {
            if (candidate.HasExplicitRegistration) continue;
            if (candidate.ContractCount != 1)
            {
                context.ReportDiagnostic(Diagnostic.Create(
                    InvalidRoute, candidate.Location, candidate.TypeName,
                    "the loader must implement exactly one page contract"));
                continue;
            }

            var appRoot = configuredAppRoot;
            if (appRoot is null || !TryRelative(appRoot, candidate.FilePath, out var relative))
            {
                appRoot = InferAppRoot(candidate.FilePath);
            }
            if (appRoot is null || !TryRelative(appRoot, candidate.FilePath, out relative))
            {
                context.ReportDiagnostic(Diagnostic.Create(InvalidLocation, candidate.Location, candidate.TypeName));
                continue;
            }

            if (!relative.EndsWith("/page.server.cs", StringComparison.Ordinal)
                && !string.Equals(relative, "page.server.cs", StringComparison.Ordinal))
            {
                context.ReportDiagnostic(Diagnostic.Create(InvalidLocation, candidate.Location, candidate.TypeName));
                continue;
            }

            var directory = relative.Length == "page.server.cs".Length
                ? string.Empty
                : relative.Substring(0, relative.Length - "/page.server.cs".Length);
            if (!TryModuleId(directory, out var moduleId, out var error))
            {
                context.ReportDiagnostic(Diagnostic.Create(
                    InvalidRoute, candidate.Location, candidate.TypeName, error));
                continue;
            }
            registrations.Add(new(candidate.TypeName, moduleId, candidate.Location));
        }

        foreach (var duplicate in registrations.GroupBy(value => value.ModuleId, StringComparer.Ordinal)
                     .Where(group => group.Count() > 1))
            foreach (var registration in duplicate)
                context.ReportDiagnostic(Diagnostic.Create(
                    DuplicateRoute, registration.Location, registration.ModuleId));

        var unique = registrations.GroupBy(value => value.ModuleId, StringComparer.Ordinal)
            .Where(group => group.Count() == 1)
            .Select(group => group.Single())
            .OrderBy(value => value.ModuleId, StringComparer.Ordinal)
            .ToArray();
        if (unique.Length == 0) return;

        var source = new StringBuilder("// <auto-generated by DotReact.AppGenerator />\n")
            .AppendLine("[assembly: global::System.Reflection.Metadata.MetadataUpdateHandlerAttribute(typeof(global::DotReact.AspNetCore.DotReactDevelopmentRevision))]");
        foreach (var registration in unique)
            source.Append("[assembly: global::DotReact.AspNetCore.DotReactPageRegistrationAttribute(typeof(")
                .Append(registration.TypeName)
                .Append("), ")
                .Append(Microsoft.CodeAnalysis.CSharp.SymbolDisplay.FormatLiteral(registration.ModuleId, quote: true))
                .AppendLine(")] ");
        context.AddSource("DotReact.AppRouter.g.cs", SourceText.From(source.ToString(), Encoding.UTF8));
    }

    internal static bool TryModuleId(string directory, out string moduleId, out string error)
    {
        moduleId = "page";
        error = string.Empty;
        if (directory.Length == 0) return true;

        var segments = directory.Split('/');
        foreach (var segment in segments)
        {
            if (segment.Length == 0 || segment is "." or "..")
            {
                error = "empty and relative segments are not supported";
                return false;
            }
            if (segment[0] == '_')
            {
                error = $"private folder '{segment}' cannot contain a route page";
                return false;
            }
            if ((segment.StartsWith("(", StringComparison.Ordinal) || segment.EndsWith(")", StringComparison.Ordinal))
                && !(segment.Length > 2 && segment[0] == '(' && segment[segment.Length - 1] == ')'
                    && IsIdentifier(segment.Substring(1, segment.Length - 2))))
            {
                error = $"route group '{segment}' is not canonical";
                return false;
            }
            if (segment[0] == '(') continue;
            if (segment.StartsWith("[...", StringComparison.Ordinal) || segment.StartsWith("[", StringComparison.Ordinal)
                || segment.EndsWith("]", StringComparison.Ordinal))
            {
                var parameter = segment.StartsWith("[...", StringComparison.Ordinal)
                    && segment.EndsWith("]", StringComparison.Ordinal)
                    ? segment.Substring(4, segment.Length - 5)
                    : segment.StartsWith("[", StringComparison.Ordinal)
                      && segment.EndsWith("]", StringComparison.Ordinal)
                        ? segment.Substring(1, segment.Length - 2)
                        : string.Empty;
                if (!IsIdentifier(parameter))
                {
                    error = $"dynamic segment '{segment}' is not canonical";
                    return false;
                }
                continue;
            }
            if (!IsStaticSegment(segment))
            {
                error = $"static segment '{segment}' is not portable";
                return false;
            }
        }
        moduleId = string.Join("/", segments) + "/page";
        return true;
    }

    private static bool IsIdentifier(string value) => value.Length > 0
        && (char.IsLetter(value[0]) || value[0] == '_')
        && value.All(character => char.IsLetterOrDigit(character) || character == '_');

    private static bool IsStaticSegment(string value) => value.Length > 0
        && char.IsLetterOrDigit(value[0])
        && value.All(character => char.IsLetterOrDigit(character) || character is '-' or '_');

    private static string? InferAppRoot(string file)
    {
        var marker = "/app/";
        var index = file.LastIndexOf(marker, StringComparison.OrdinalIgnoreCase);
        if (index >= 0) return file.Substring(0, index + "/app".Length);
        return file.EndsWith("/app", StringComparison.OrdinalIgnoreCase) ? file : null;
    }

    private static bool TryRelative(string root, string file, out string relative)
    {
        relative = string.Empty;
        var prefix = root.EndsWith("/", StringComparison.Ordinal) ? root : root + "/";
        if (!file.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return false;
        relative = file.Substring(prefix.Length);
        return relative.Length > 0;
    }

    private static string Normalize(string value) => value.Replace('\\', '/').TrimEnd('/');

    private sealed class PageCandidate
    {
        public PageCandidate(
            string typeName,
            string filePath,
            Location location,
            int contractCount,
            bool hasExplicitRegistration)
        {
            TypeName = typeName;
            FilePath = filePath;
            Location = location;
            ContractCount = contractCount;
            HasExplicitRegistration = hasExplicitRegistration;
        }

        public string TypeName { get; }
        public string FilePath { get; }
        public Location Location { get; }
        public int ContractCount { get; }
        public bool HasExplicitRegistration { get; }
    }

    private sealed class PageRegistration
    {
        public PageRegistration(string typeName, string moduleId, Location location)
        {
            TypeName = typeName;
            ModuleId = moduleId;
            Location = location;
        }

        public string TypeName { get; }
        public string ModuleId { get; }
        public Location Location { get; }
    }
}
