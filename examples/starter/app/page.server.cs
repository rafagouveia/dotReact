using DotReact.AspNetCore;

namespace DotReact.Starter.Pages.Home;

public sealed class HomePage(TimeProvider timeProvider) : IDotReactPage<HomePageProps>
{
    public ValueTask<HomePageProps> LoadAsync(
        DotReactPageContext context,
        CancellationToken cancellationToken) =>
        ValueTask.FromResult(new HomePageProps(
            "Seu primeiro app DotReact com page.drx",
            timeProvider.GetUtcNow()));
}
