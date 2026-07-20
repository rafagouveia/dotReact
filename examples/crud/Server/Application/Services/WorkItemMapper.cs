namespace DotReact.Crud;

public sealed class WorkItemMapper
{
    public WorkItemSnapshot Map(WorkItem item) => new(item.Id, item.Title, item.Description, item.Status,
        item.Priority, item.CreatedAt, item.UpdatedAt);
}
