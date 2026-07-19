namespace DotReact.Crud;

public sealed class DashboardStatsCalculator : IDashboardStatsCalculator
{
    public DashboardSnapshotStats Calculate(IReadOnlyCollection<WorkItemSnapshot> items) => new(
        items.Count,
        items.Count(item => item.Status == WorkItemStatus.Backlog),
        items.Count(item => item.Status == WorkItemStatus.InProgress),
        items.Count(item => item.Status == WorkItemStatus.Done),
        items.Count(item => item.Priority == WorkItemPriority.High));
}
