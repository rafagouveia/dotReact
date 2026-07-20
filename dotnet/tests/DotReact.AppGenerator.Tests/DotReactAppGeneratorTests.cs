using System.Collections.Immutable;
using DotReact.AppGenerator;
using DotReact.AspNetCore;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

[assembly: DotReactPageRegistration(typeof(DotReact.AppGenerator.Tests.RegisteredAppPage), "(tests)/registered/page")]

namespace DotReact.AppGenerator.Tests;

public sealed class DotReactAppGeneratorTests
{
    [Fact]
    public void Registers_page_server_file_from_its_app_router_path()
    {
        var result = Run("C:/project/app/(operations)/customers/[id]/page.server.cs");

        Assert.Empty(result.Diagnostics.Where(diagnostic => diagnostic.Severity == DiagnosticSeverity.Error));
        var generated = Assert.Single(result.GeneratedTrees)
            .GetText(TestContext.Current.CancellationToken).ToString();
        Assert.Contains("typeof(global::Example.CustomerPage)", generated);
        Assert.Contains("\"(operations)/customers/[id]/page\"", generated);
        Assert.Contains("MetadataUpdateHandlerAttribute", generated);
        Assert.Contains("DotReactDevelopmentRevision", generated);
    }

    [Fact]
    public void Rejects_pages_inside_private_folders()
    {
        var result = Run("C:/project/app/_components/page.server.cs");

        Assert.Contains(result.Diagnostics, diagnostic => diagnostic.Id == "DRXAPP002");
        Assert.Empty(result.GeneratedTrees);
    }

    [Fact]
    public void Rejects_malformed_dynamic_segments()
    {
        var result = Run("C:/project/app/reports/[...]/page.server.cs");

        Assert.Contains(result.Diagnostics, diagnostic => diagnostic.Id == "DRXAPP002");
        Assert.Empty(result.GeneratedTrees);
    }

    [Fact]
    public void Explicit_page_attribute_remains_an_escape_hatch()
    {
        var result = Run(
            "C:/project/app/reports/page.server.cs",
            "[DotReactPage(\"/custom\", \"custom/page\")] ");

        Assert.Empty(result.Diagnostics.Where(diagnostic => diagnostic.Severity == DiagnosticSeverity.Error));
        Assert.Empty(result.GeneratedTrees);
    }

    [Fact]
    public void Runtime_discovery_consumes_generated_page_registration()
    {
        var services = new ServiceCollection();

        services.AddDotReactPages(typeof(RegisteredAppPage).Assembly);

        using var provider = services.BuildServiceProvider();
        Assert.NotNull(provider.GetService<RegisteredAppPage>());
    }

    private static GeneratorDriverRunResult Run(string path, string attribute = "")
    {
        var source = $$"""
            using DotReact.AspNetCore;
            namespace Example;
            public sealed record CustomerProps(string Name);
            {{attribute}}public sealed class CustomerPage : IDotReactPage<CustomerProps>
            {
                public ValueTask<CustomerProps> LoadAsync(
                    DotReactPageContext context,
                    CancellationToken cancellationToken) =>
                    ValueTask.FromResult(new CustomerProps("Arxis"));
            }
            """;
        var syntaxTree = CSharpSyntaxTree.ParseText(source, path: path);
        var references = AppDomain.CurrentDomain.GetAssemblies()
            .Where(assembly => !assembly.IsDynamic && !string.IsNullOrWhiteSpace(assembly.Location))
            .Select(assembly => MetadataReference.CreateFromFile(assembly.Location))
            .Cast<MetadataReference>()
            .Append(MetadataReference.CreateFromFile(typeof(IDotReactPage<>).Assembly.Location))
            .DistinctBy(reference => reference.Display, StringComparer.OrdinalIgnoreCase)
            .ToArray();
        var compilation = CSharpCompilation.Create(
            "GeneratorFixture",
            [syntaxTree],
            references,
            new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));
        GeneratorDriver driver = CSharpGeneratorDriver.Create(new DotReactAppGenerator());
        driver = driver.RunGenerators(compilation);
        return driver.GetRunResult();
    }
}

public sealed class RegisteredAppPage : IDotReactPage<RegisteredAppPageProps>
{
    public ValueTask<RegisteredAppPageProps> LoadAsync(
        DotReactPageContext context,
        CancellationToken cancellationToken) =>
        ValueTask.FromResult(new RegisteredAppPageProps("registered"));
}

public sealed record RegisteredAppPageProps(string Value);
