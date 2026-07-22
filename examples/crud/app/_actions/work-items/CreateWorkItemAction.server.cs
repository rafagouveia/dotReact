using DotReact.AspNetCore;
using Microsoft.AspNetCore.Authorization;

namespace DotReact.Crud;

[Authorize(Policy = WorkItemAuthorization.PolicyName)]
[DotReactAction("work-items/create")]
public sealed class CreateWorkItemAction(
    ICreateWorkItemUseCase useCase,
    WorkItemPresentationMapper mapper)
    : IDotReactAction<CreateWorkItemRequest, WorkItemDto>
{
    public async ValueTask<DotReactActionResult<WorkItemDto>> ExecuteAsync(
        CreateWorkItemRequest request,
        CancellationToken cancellationToken)
    {
        var result = await useCase.ExecuteAsync(mapper.ToInput(request), cancellationToken);
        return result.Validation.IsValid
            ? DotReactActionResult<WorkItemDto>.Success(mapper.ToDto(result.Item!), ["/"])
            : DotReactActionResult<WorkItemDto>.Validation(mapper.ToErrors(result.Validation));
    }
}
