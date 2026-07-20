using DotReact.AspNetCore;
using Microsoft.AspNetCore.Authorization;

namespace DotReact.Crud;

[Authorize(Policy = WorkItemAuthorization.PolicyName)]
[DotReactAction("work-items/update")]
public sealed class UpdateWorkItemAction(
    IUpdateWorkItemUseCase useCase,
    WorkItemPresentationMapper mapper)
    : IDotReactAction<UpdateWorkItemActionRequest, WorkItemDto>
{
    public async ValueTask<DotReactActionResult<WorkItemDto>> ExecuteAsync(
        UpdateWorkItemActionRequest request,
        CancellationToken cancellationToken)
    {
        var result = await useCase.ExecuteAsync(request.Id, mapper.ToInput(request), cancellationToken);
        if (!result.Validation.IsValid)
            return DotReactActionResult<WorkItemDto>.Validation(mapper.ToErrors(result.Validation));
        return result.Found
            ? DotReactActionResult<WorkItemDto>.Success(mapper.ToDto(result.Item!), ["/"])
            : DotReactActionResult<WorkItemDto>.NotFound("Work item não encontrado.");
    }
}
