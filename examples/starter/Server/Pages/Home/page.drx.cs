using DotReact.AspNetCore;

namespace DotReact.Starter.Pages.Home;

[DotReactPage("page")]
public sealed class HomePage : IDotReactPage<HomePageProps>
{
    public ValueTask<HomePageProps> LoadAsync(
        DotReactPageContext context,
        CancellationToken cancellationToken) =>
        ValueTask.FromResult(new HomePageProps(
            "Seu primeiro app DotReact com page.drx",
            DateTimeOffset.UtcNow));
}
