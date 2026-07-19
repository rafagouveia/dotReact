namespace DotReact.Crud;

public interface IGetDashboardUseCase
{
    Task<DashboardSnapshot> ExecuteAsync(CancellationToken cancellationToken);
}

public sealed class GetDashboardUseCase(
    IListWorkItemsUseCase listWorkItems,
    IDashboardStatsCalculator statsCalculator,
    IClock clock) : IGetDashboardUseCase
{
    public async Task<DashboardSnapshot> ExecuteAsync(CancellationToken cancellationToken)
    {
        var items = await listWorkItems.ExecuteAsync(cancellationToken);
        return new DashboardSnapshot(items, statsCalculator.Calculate(items), clock.UtcNow);
    }
}
