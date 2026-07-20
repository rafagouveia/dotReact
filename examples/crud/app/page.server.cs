using DotReact.AspNetCore;
using Microsoft.AspNetCore.Authorization;

namespace DotReact.Crud;

[Authorize(Policy = WorkItemAuthorization.PolicyName)]
public sealed class WorkItemsPage(
    IGetDashboardUseCase useCase,
    WorkItemPresentationMapper mapper) : IDotReactPage<DashboardProps>
{
    public async ValueTask<DashboardProps> LoadAsync(
        DotReactPageContext context,
        CancellationToken cancellationToken) =>
        mapper.ToProps(await useCase.ExecuteAsync(cancellationToken));
}
