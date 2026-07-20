namespace DotReact.Crud;

public sealed class WorkItemPresentationMapper
{
    public WorkItemInput ToInput(CreateWorkItemRequest request) =>
        new(request.Title, request.Description, request.Status, request.Priority);

    public WorkItemInput ToInput(UpdateWorkItemRequest request) =>
        new(request.Title, request.Description, request.Status, request.Priority);

    public WorkItemInput ToInput(UpdateWorkItemActionRequest request) =>
        new(request.Title, request.Description, request.Status, request.Priority);

    public WorkItemDto ToDto(WorkItemSnapshot item) => new(
        item.Id,
        item.Title,
        item.Description,
        item.Status,
        item.Priority,
        item.CreatedAt,
        item.UpdatedAt);

    public DashboardProps ToProps(DashboardSnapshot dashboard) => new(
        dashboard.Items.Select(ToDto).ToList(),
        new DashboardStats(
            dashboard.Stats.Total,
            dashboard.Stats.Backlog,
            dashboard.Stats.InProgress,
            dashboard.Stats.Done,
            dashboard.Stats.HighPriority),
        dashboard.GeneratedAt);

    public Dictionary<string, string[]> ToErrors(InputValidationResult validation) =>
        validation.Errors.ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.OrdinalIgnoreCase);
}
