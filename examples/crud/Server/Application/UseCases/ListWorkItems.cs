namespace DotReact.Crud;

public interface IListWorkItemsUseCase
{
    Task<IReadOnlyList<WorkItemSnapshot>> ExecuteAsync(CancellationToken cancellationToken);
}

public sealed class ListWorkItemsUseCase(IWorkItemReadRepository repository, IWorkItemMapper mapper)
    : IListWorkItemsUseCase
{
    public async Task<IReadOnlyList<WorkItemSnapshot>> ExecuteAsync(CancellationToken cancellationToken)
    {
        var items = await repository.ListAsync(cancellationToken);
        return items
            .OrderByDescending(item => item.UpdatedAt)
            .ThenByDescending(item => item.Id)
            .Select(mapper.Map)
            .ToList();
    }
}
