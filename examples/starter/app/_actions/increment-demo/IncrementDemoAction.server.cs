using DotReact.AspNetCore;
using Microsoft.AspNetCore.Authorization;

namespace DotReact.Starter.Actions;

[AllowAnonymous]
[DotReactAction("demo/increment")]
public sealed class IncrementDemoAction
    : IDotReactAction<IncrementDemoRequest, IncrementDemoResponse>
{
    public ValueTask<DotReactActionResult<IncrementDemoResponse>> ExecuteAsync(
        IncrementDemoRequest request,
        CancellationToken cancellationToken)
    {
        if (request.Value is < 0 or >= 100)
        {
            return ValueTask.FromResult(DotReactActionResult<IncrementDemoResponse>.Validation(
                new Dictionary<string, string[]>
                {
                    ["value"] = ["O valor deve estar entre 0 e 99."]
                }));
        }

        return ValueTask.FromResult(DotReactActionResult<IncrementDemoResponse>.Success(
            new IncrementDemoResponse(request.Value + 1, "Server Action C#")));
    }
}
