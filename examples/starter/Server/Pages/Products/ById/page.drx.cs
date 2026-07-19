using DotReact.AspNetCore;

namespace DotReact.Starter.Pages.Products.ById;

[DotReactPage("products/[id]/page")]
public sealed class ProductPage : IDotReactResultPage<ProductPageProps>
{
    public ValueTask<DotReactPageResult<ProductPageProps>> LoadAsync(
        DotReactPageContext context,
        CancellationToken cancellationToken)
    {
        var id = context.GetRouteValue<int>("id");
        if (id == 404)
            return ValueTask.FromResult(DotReactPageResult<ProductPageProps>.NotFound());
        if (id == 302)
            return ValueTask.FromResult(DotReactPageResult<ProductPageProps>.Redirect("/"));
        if (id == 500)
            throw new InvalidOperationException("Erro de demonstração controlado pelo error.drx.");
        return ValueTask.FromResult(DotReactPageResult<ProductPageProps>.Page(new ProductPageProps(
            id,
            $"Produto dinâmico #{id}",
            "Loader C# + routing ASP.NET Core")));
    }
}
