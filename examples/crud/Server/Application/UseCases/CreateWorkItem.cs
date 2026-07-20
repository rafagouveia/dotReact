namespace DotReact.Crud;

public interface ICreateWorkItemUseCase
{
    Task<CreateWorkItemResult> ExecuteAsync(WorkItemInput input, CancellationToken cancellationToken);
}

public sealed class CreateWorkItemUseCase(
    IWorkItemWriteRepository repository,
    WorkItemInputValidator validator,
    WorkItemMapper mapper,
    IClock clock) : ICreateWorkItemUseCase
{
    public async Task<CreateWorkItemResult> ExecuteAsync(
        WorkItemInput input,
        CancellationToken cancellationToken)
    {
        var validation = validator.Validate(input);
        if (!validation.IsValid)
            return new CreateWorkItemResult(null, validation);

        var item = WorkItem.Create(input.Title!, input.Description, input.Status, input.Priority, clock.UtcNow);
        await repository.AddAsync(item, cancellationToken);
        return new CreateWorkItemResult(mapper.Map(item), validation);
    }
}
