namespace DotReact.Crud;

public interface IWorkItemWriteRepository
{
    Task AddAsync(WorkItem item, CancellationToken cancellationToken);
    Task UpdateAsync(WorkItem item, CancellationToken cancellationToken);
    Task DeleteAsync(WorkItem item, CancellationToken cancellationToken);
}
