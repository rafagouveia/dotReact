using DotReact.AspNetCore;
using Microsoft.AspNetCore.Authorization;

namespace DotReact.Crud;

[Authorize(Policy = WorkItemAuthorization.PolicyName)]
[DotReactAction("work-items/delete")]
public sealed class DeleteWorkItemAction(IDeleteWorkItemUseCase useCase)
    : IDotReactAction<DeleteWorkItemRequest, DeleteWorkItemResponse>
{
    public async ValueTask<DotReactActionResult<DeleteWorkItemResponse>> ExecuteAsync(
        DeleteWorkItemRequest request,
        CancellationToken cancellationToken) =>
        await useCase.ExecuteAsync(request.Id, cancellationToken)
            ? DotReactActionResult<DeleteWorkItemResponse>.Success(new(request.Id, true), ["/"])
            : DotReactActionResult<DeleteWorkItemResponse>.NotFound("Work item não encontrado.");
}
