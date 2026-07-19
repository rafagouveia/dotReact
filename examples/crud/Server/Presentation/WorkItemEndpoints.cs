using DotReact.AspNetCore;

namespace DotReact.Crud;

public static class WorkItemEndpoints
{
    public static IEndpointRouteBuilder MapWorkItemEndpoints(this IEndpointRouteBuilder endpoints)
    {
        endpoints.MapGet("/health", () => Results.Ok(new { status = "healthy", database = "sqlite" }));

        endpoints.MapDotReactPage("/", "work-items/page", async (
            HttpContext context,
            CancellationToken cancellationToken) =>
        {
            var useCase = context.RequestServices.GetRequiredService<IGetDashboardUseCase>();
            return ToProps(await useCase.ExecuteAsync(cancellationToken));
        });

        var api = endpoints.MapGroup("/api/work-items");
        api.MapGet("/", ListAsync);
        api.MapPost("/", CreateAsync);
        api.MapPut("/{id:int}", UpdateAsync);
        api.MapDelete("/{id:int}", DeleteAsync);
        return endpoints;
    }

    private static async Task<IResult> ListAsync(
        IListWorkItemsUseCase useCase,
        CancellationToken cancellationToken) =>
        Results.Ok((await useCase.ExecuteAsync(cancellationToken)).Select(ToDto));

    private static async Task<IResult> CreateAsync(
        CreateWorkItemRequest request,
        ICreateWorkItemUseCase useCase,
        CancellationToken cancellationToken)
    {
        var result = await useCase.ExecuteAsync(ToInput(request), cancellationToken);
        if (!result.Validation.IsValid)
            return Results.ValidationProblem(ToErrors(result.Validation));

        var dto = ToDto(result.Item!);
        return Results.Created($"/api/work-items/{dto.Id}", dto);
    }

    private static async Task<IResult> UpdateAsync(
        int id,
        UpdateWorkItemRequest request,
        IUpdateWorkItemUseCase useCase,
        CancellationToken cancellationToken)
    {
        var result = await useCase.ExecuteAsync(id, ToInput(request), cancellationToken);
        if (!result.Validation.IsValid)
            return Results.ValidationProblem(ToErrors(result.Validation));
        if (!result.Found)
            return Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Work item não encontrado.");
        return Results.Ok(ToDto(result.Item!));
    }

    private static async Task<IResult> DeleteAsync(
        int id,
        IDeleteWorkItemUseCase useCase,
        CancellationToken cancellationToken) =>
        await useCase.ExecuteAsync(id, cancellationToken)
            ? Results.NoContent()
            : Results.Problem(statusCode: StatusCodes.Status404NotFound, title: "Work item não encontrado.");

    private static WorkItemInput ToInput(CreateWorkItemRequest request) =>
        new(request.Title, request.Description, request.Status, request.Priority);

    private static WorkItemInput ToInput(UpdateWorkItemRequest request) =>
        new(request.Title, request.Description, request.Status, request.Priority);

    private static WorkItemDto ToDto(WorkItemSnapshot item) => new(item.Id, item.Title, item.Description,
        item.Status, item.Priority, item.CreatedAt, item.UpdatedAt);

    private static DashboardProps ToProps(DashboardSnapshot dashboard) => new(
        dashboard.Items.Select(ToDto).ToList(),
        new DashboardStats(dashboard.Stats.Total, dashboard.Stats.Backlog, dashboard.Stats.InProgress,
            dashboard.Stats.Done, dashboard.Stats.HighPriority),
        dashboard.GeneratedAt);

    private static Dictionary<string, string[]> ToErrors(InputValidationResult validation) =>
        validation.Errors.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.OrdinalIgnoreCase);
}
