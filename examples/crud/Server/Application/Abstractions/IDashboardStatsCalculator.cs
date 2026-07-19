namespace DotReact.Crud;

public interface IDashboardStatsCalculator
{
    DashboardSnapshotStats Calculate(IReadOnlyCollection<WorkItemSnapshot> items);
}
