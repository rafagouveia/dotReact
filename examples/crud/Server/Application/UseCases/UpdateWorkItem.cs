namespace DotReact.Crud;

public interface IUpdateWorkItemUseCase
{
    Task<UpdateWorkItemResult> ExecuteAsync(int id, WorkItemInput input, CancellationToken cancellationToken);
}

public sealed class UpdateWorkItemUseCase(
    IWorkItemReadRepository readRepository,
    IWorkItemWriteRepository writeRepository,
    IWorkItemInputValidator validator,
    IWorkItemMapper mapper,
    IClock clock) : IUpdateWorkItemUseCase
{
    public async Task<UpdateWorkItemResult> ExecuteAsync(
        int id,
        WorkItemInput input,
        CancellationToken cancellationToken)
    {
        var validation = validator.Validate(input);
        if (!validation.IsValid)
            return new UpdateWorkItemResult(true, null, validation);

        var item = await readRepository.FindAsync(id, cancellationToken);
        if (item is null)
            return new UpdateWorkItemResult(false, null, validation);

        item.Update(input.Title!, input.Description, input.Status, input.Priority, clock.UtcNow);
        await writeRepository.UpdateAsync(item, cancellationToken);
        return new UpdateWorkItemResult(true, mapper.Map(item), validation);
    }
}
