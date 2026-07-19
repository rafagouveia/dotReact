namespace DotReact.Crud;

public interface IWorkItemReadRepository
{
    Task<IReadOnlyList<WorkItem>> ListAsync(CancellationToken cancellationToken);
    Task<WorkItem?> FindAsync(int id, CancellationToken cancellationToken);
}
