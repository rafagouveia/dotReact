namespace DotReact.Crud;

public sealed record WorkItemInput(string? Title, string? Description, WorkItemStatus Status, WorkItemPriority Priority);

public sealed record WorkItemSnapshot(int Id, string Title, string? Description, WorkItemStatus Status,
    WorkItemPriority Priority, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);

public sealed record DashboardSnapshotStats(int Total, int Backlog, int InProgress, int Done, int HighPriority);

public sealed record DashboardSnapshot(
    IReadOnlyList<WorkItemSnapshot> Items,
    DashboardSnapshotStats Stats,
    DateTimeOffset GeneratedAt);

public sealed record InputValidationResult(IReadOnlyDictionary<string, string[]> Errors)
{
    public bool IsValid => Errors.Count == 0;
}

public sealed record CreateWorkItemResult(WorkItemSnapshot? Item, InputValidationResult Validation);
public sealed record UpdateWorkItemResult(bool Found, WorkItemSnapshot? Item, InputValidationResult Validation);
