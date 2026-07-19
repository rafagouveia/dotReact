namespace DotReact.Crud;

public interface IDeleteWorkItemUseCase
{
    Task<bool> ExecuteAsync(int id, CancellationToken cancellationToken);
}

public sealed class DeleteWorkItemUseCase(
    IWorkItemReadRepository readRepository,
    IWorkItemWriteRepository writeRepository) : IDeleteWorkItemUseCase
{
    public async Task<bool> ExecuteAsync(int id, CancellationToken cancellationToken)
    {
        var item = await readRepository.FindAsync(id, cancellationToken);
        if (item is null)
            return false;

        await writeRepository.DeleteAsync(item, cancellationToken);
        return true;
    }
}
