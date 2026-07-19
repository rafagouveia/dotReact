using DotReact.AspNetCore;
using DotReact.TypeGen;
using Xunit;

namespace DotReact.TypeGen.Tests;

public sealed class BackendGeneratorTests
{
    [Fact]
    public void Discovers_only_annotated_pages_and_actions_and_generates_stable_artifacts()
    {
        var generator = new DotReactBackendGenerator();

        var backend = generator.Discover(typeof(BackendGeneratorTests).Assembly);
        var manifest = generator.GenerateManifest(backend);
        var client = generator.GenerateActionClient(backend, "./contracts");

        Assert.Equal(2, backend.Pages.Count);
        var page = Assert.Single(backend.Pages, value => value.ModuleId == "products/[id]/page");
        Assert.Equal("/products/{id:int}", page.Pattern);
        Assert.Equal("/docs/{**slug}", Assert.Single(backend.Pages, value => value.ModuleId == "docs/[...slug]/page").Pattern);
        var action = Assert.Single(backend.Actions);
        Assert.Equal("products/rename", action.Id);
        Assert.Equal("productsRename", action.ExportName);
        Assert.Contains("\"schemaVersion\": 2", manifest);
        Assert.Contains("\"moduleId\": \"products/[id]/page\"", manifest);
        Assert.Contains("\"routing\": \"convention\"", manifest);
        Assert.Contains("createServerAction<RenameRequest, RenameResponse>(\"products/rename\")", client);
        Assert.DoesNotContain(nameof(UnannotatedPage), manifest);
    }

    [Fact]
    public void Action_clients_reference_the_same_closed_generic_names_as_contract_generation()
    {
        var contract = new DotReactBackendContract([], [new DotReactActionContract(
            "products/batch-rename",
            "productsBatchRename",
            typeof(ActionEnvelope<RenameRequest>),
            typeof(ActionEnvelope<RenameResponse>))]);
        var generator = new DotReactBackendGenerator();

        var client = generator.GenerateActionClient(contract, "./contracts");
        var types = new TypeScriptGenerator().Generate(contract.ContractTypes);

        Assert.Contains("ActionEnvelopeOfRenameRequest", client);
        Assert.Contains("ActionEnvelopeOfRenameResponse", client);
        Assert.Contains("export interface ActionEnvelopeOfRenameRequest", types);
        Assert.Contains("export interface ActionEnvelopeOfRenameResponse", types);
    }

    public sealed record ProductProps(int Id, string Name);
    public sealed record RenameRequest(int Id, string Name);
    public sealed record RenameResponse(string Name);
    public sealed record ActionEnvelope<T>(T Value);

    [DotReactPage("/products/{id:int}", "products/[id]/page")]
    private sealed class ProductPage : IDotReactPage<ProductProps>
    {
        public ValueTask<ProductProps> LoadAsync(
            DotReactPageContext context,
            CancellationToken cancellationToken) =>
            ValueTask.FromResult(new ProductProps(context.GetRouteValue<int>("id"), "Product"));
    }

    [DotReactPage("docs/[...slug]/page")]
    private sealed class ConventionPage : IDotReactPage<ProductProps>
    {
        public ValueTask<ProductProps> LoadAsync(
            DotReactPageContext context,
            CancellationToken cancellationToken) =>
            ValueTask.FromResult(new ProductProps(0, "Docs"));
    }

    [DotReactAction("products/rename")]
    private sealed class RenameAction : IDotReactAction<RenameRequest, RenameResponse>
    {
        public ValueTask<DotReactActionResult<RenameResponse>> ExecuteAsync(
            RenameRequest request,
            CancellationToken cancellationToken) =>
            ValueTask.FromResult(DotReactActionResult<RenameResponse>.Success(new(request.Name)));
    }

    private sealed class UnannotatedPage : IDotReactPage<ProductProps>
    {
        public ValueTask<ProductProps> LoadAsync(
            DotReactPageContext context,
            CancellationToken cancellationToken) =>
            ValueTask.FromResult(new ProductProps(0, "Hidden"));
    }
}
