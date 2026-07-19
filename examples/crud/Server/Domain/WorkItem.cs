using System.ComponentModel.DataAnnotations;

namespace DotReact.Crud;

public enum WorkItemStatus { Backlog, InProgress, Done }
public enum WorkItemPriority { Low, Medium, High }

public sealed class WorkItem
{
    private WorkItem() { }

    private WorkItem(
        string title,
        string? description,
        WorkItemStatus status,
        WorkItemPriority priority,
        DateTimeOffset now)
    {
        Title = NormalizeTitle(title);
        Description = NormalizeDescription(description);
        Status = status;
        Priority = priority;
        CreatedAt = now;
        UpdatedAt = now;
    }

    public int Id { get; private set; }

    [MaxLength(120)]
    public string Title { get; private set; } = string.Empty;

    [MaxLength(1000)]
    public string? Description { get; private set; }

    public WorkItemStatus Status { get; private set; }
    public WorkItemPriority Priority { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }

    public static WorkItem Create(
        string title,
        string? description,
        WorkItemStatus status,
        WorkItemPriority priority,
        DateTimeOffset now) => new(title, description, status, priority, now);

    public void Update(
        string title,
        string? description,
        WorkItemStatus status,
        WorkItemPriority priority,
        DateTimeOffset now)
    {
        Title = NormalizeTitle(title);
        Description = NormalizeDescription(description);
        Status = status;
        Priority = priority;
        UpdatedAt = now;
    }

    private static string NormalizeTitle(string title) => title.Trim();
    private static string? NormalizeDescription(string? description) =>
        string.IsNullOrWhiteSpace(description) ? null : description.Trim();
}
