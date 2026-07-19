using Microsoft.EntityFrameworkCore;

namespace DotReact.Crud;

public sealed class EfWorkItemRepository(WorkItemsDbContext db)
    : IWorkItemReadRepository, IWorkItemWriteRepository
{
    public async Task<IReadOnlyList<WorkItem>> ListAsync(CancellationToken cancellationToken) =>
        await db.WorkItems.AsNoTracking().ToListAsync(cancellationToken);

    public async Task<WorkItem?> FindAsync(int id, CancellationToken cancellationToken) =>
        await db.WorkItems.FindAsync([id], cancellationToken);

    public async Task AddAsync(WorkItem item, CancellationToken cancellationToken)
    {
        db.WorkItems.Add(item);
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task UpdateAsync(WorkItem item, CancellationToken cancellationToken)
    {
        db.WorkItems.Update(item);
        await db.SaveChangesAsync(cancellationToken);
    }

    public async Task DeleteAsync(WorkItem item, CancellationToken cancellationToken)
    {
        db.WorkItems.Remove(item);
        await db.SaveChangesAsync(cancellationToken);
    }
}
