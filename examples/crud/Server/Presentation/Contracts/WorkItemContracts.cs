namespace DotReact.Crud;

public sealed record WorkItemDto(
    int Id,
    string Title,
    string? Description,
    WorkItemStatus Status,
    WorkItemPriority Priority,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt);

public sealed record DashboardStats(int Total, int Backlog, int InProgress, int Done, int HighPriority);

public sealed record DashboardProps(
    IReadOnlyList<WorkItemDto> Items,
    DashboardStats Stats,
    DateTimeOffset GeneratedAt);

public sealed record CreateWorkItemRequest(
    string? Title,
    string? Description,
    WorkItemStatus Status,
    WorkItemPriority Priority);

public sealed record UpdateWorkItemRequest(
    string? Title,
    string? Description,
    WorkItemStatus Status,
    WorkItemPriority Priority);

public sealed record UpdateWorkItemActionRequest(
    int Id,
    string? Title,
    string? Description,
    WorkItemStatus Status,
    WorkItemPriority Priority);

public sealed record DeleteWorkItemRequest(int Id);

public sealed record DeleteWorkItemResponse(int Id, bool Deleted);
