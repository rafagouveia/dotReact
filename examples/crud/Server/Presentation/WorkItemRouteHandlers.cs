namespace DotReact.Crud;

/// <summary>
/// Minimal API route handlers kept as an explicit interoperability example.
/// The DotReact UI uses the discovered page and typed server actions instead.
/// </summary>
public static class WorkItemRouteHandlers
{
    public static IEndpointRouteBuilder MapWorkItemRouteHandlers(this IEndpointRouteBuilder endpoints)
    {
        var api = endpoints.MapGroup("/api/work-items")
            .RequireAuthorization(WorkItemAuthorization.PolicyName);
        api.MapGet("/", ListAsync);
        api.MapPost("/", CreateAsync);
        api.MapPut("/{id:int}", UpdateAsync);
        api.MapDelete("/{id:int}", DeleteAsync);
        return endpoints;
    }

    private static async Task<IResult> ListAsync(
        IListWorkItemsUseCase useCase,
        WorkItemPresentationMapper mapper,
        CancellationToken cancellationToken) =>
        Results.Ok((await useCase.ExecuteAsync(cancellationToken)).Select(mapper.ToDto));

    private static async Task<IResult> CreateAsync(
        CreateWorkItemRequest request,
        ICreateWorkItemUseCase useCase,
        WorkItemPresentationMapper mapper,
        CancellationToken cancellationToken)
    {
        var result = await useCase.ExecuteAsync(mapper.ToInput(request), cancellationToken);
        if (!result.Validation.IsValid)
            return Results.ValidationProblem(mapper.ToErrors(result.Validation));

        var dto = mapper.ToDto(result.Item!);
        return Results.Created($"/api/work-items/{dto.Id}", dto);
    }

    private static async Task<IResult> UpdateAsync(
        int id,
        UpdateWorkItemRequest request,
        IUpdateWorkItemUseCase useCase,
        WorkItemPresentationMapper mapper,
        CancellationToken cancellationToken)
    {
        var result = await useCase.ExecuteAsync(id, mapper.ToInput(request), cancellationToken);
        if (!result.Validation.IsValid)
            return Results.ValidationProblem(mapper.ToErrors(result.Validation));
        if (!result.Found)
            return Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Work item não encontrado.");
        return Results.Ok(mapper.ToDto(result.Item!));
    }

    private static async Task<IResult> DeleteAsync(
        int id,
        IDeleteWorkItemUseCase useCase,
        CancellationToken cancellationToken) =>
        await useCase.ExecuteAsync(id, cancellationToken)
            ? Results.NoContent()
            : Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Work item não encontrado.");
}
