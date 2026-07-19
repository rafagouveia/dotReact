using DotReact.Crud;
using Xunit;

namespace DotReact.Crud.Tests;

public sealed class ApplicationUseCaseTests
{
    [Fact]
    public void Validator_reports_all_invalid_fields()
    {
        var validator = new WorkItemInputValidator();
        var input = new WorkItemInput(" ", new string('x', 1001), (WorkItemStatus)999, (WorkItemPriority)999);

        var result = validator.Validate(input);

        Assert.False(result.IsValid);
        Assert.Equal(["description", "priority", "status", "title"], result.Errors.Keys.Order().ToArray());
    }

    [Fact]
    public async Task Create_uses_ports_clock_and_domain_normalization()
    {
        var repository = new FakeRepository();
        var now = new DateTimeOffset(2026, 7, 18, 12, 0, 0, TimeSpan.Zero);
        var useCase = new CreateWorkItemUseCase(
            repository,
            new WorkItemInputValidator(),
            new WorkItemMapper(),
            new FakeClock(now));

        var result = await useCase.ExecuteAsync(
            new WorkItemInput("  Título  ", "  Descrição  ", WorkItemStatus.Backlog, WorkItemPriority.High),
            TestContext.Current.CancellationToken);

        Assert.True(result.Validation.IsValid);
        Assert.Equal("Título", result.Item?.Title);
        Assert.Equal("Descrição", result.Item?.Description);
        Assert.Equal(now, result.Item?.CreatedAt);
        Assert.Equal(1, repository.AddCalls);
    }

    [Fact]
    public async Task Update_missing_item_preserves_not_found_without_writing()
    {
        var repository = new FakeRepository();
        var useCase = new UpdateWorkItemUseCase(repository, repository, new WorkItemInputValidator(),
            new WorkItemMapper(), new FakeClock(DateTimeOffset.UtcNow));

        var result = await useCase.ExecuteAsync(42,
            new WorkItemInput("Válido", null, WorkItemStatus.Done, WorkItemPriority.Low),
            TestContext.Current.CancellationToken);

        Assert.False(result.Found);
        Assert.True(result.Validation.IsValid);
        Assert.Equal(0, repository.UpdateCalls);
    }

    [Fact]
    public async Task Delete_missing_item_returns_false_without_writing()
    {
        var repository = new FakeRepository();
        var useCase = new DeleteWorkItemUseCase(repository, repository);

        var deleted = await useCase.ExecuteAsync(404, TestContext.Current.CancellationToken);

        Assert.False(deleted);
        Assert.Equal(0, repository.DeleteCalls);
    }

    [Fact]
    public async Task Dashboard_uses_list_stats_and_clock_ports()
    {
        var repository = new FakeRepository();
        repository.Items.Add(WorkItem.Create("Alta", null, WorkItemStatus.InProgress,
            WorkItemPriority.High, DateTimeOffset.Parse("2026-07-17T12:00:00Z")));
        repository.Items.Add(WorkItem.Create("Feita", null, WorkItemStatus.Done,
            WorkItemPriority.Low, DateTimeOffset.Parse("2026-07-16T12:00:00Z")));
        var now = DateTimeOffset.Parse("2026-07-18T12:00:00Z");
        var list = new ListWorkItemsUseCase(repository, new WorkItemMapper());
        var dashboard = new GetDashboardUseCase(list, new DashboardStatsCalculator(), new FakeClock(now));

        var result = await dashboard.ExecuteAsync(TestContext.Current.CancellationToken);

        Assert.Equal(2, result.Stats.Total);
        Assert.Equal(1, result.Stats.HighPriority);
        Assert.Equal(now, result.GeneratedAt);
    }

    private sealed class FakeClock(DateTimeOffset utcNow) : IClock
    {
        public DateTimeOffset UtcNow { get; } = utcNow;
    }

    private sealed class FakeRepository : IWorkItemReadRepository, IWorkItemWriteRepository
    {
        public List<WorkItem> Items { get; } = [];
        public int AddCalls { get; private set; }
        public int UpdateCalls { get; private set; }
        public int DeleteCalls { get; private set; }

        public Task<IReadOnlyList<WorkItem>> ListAsync(CancellationToken cancellationToken) =>
            Task.FromResult<IReadOnlyList<WorkItem>>(Items);

        public Task<WorkItem?> FindAsync(int id, CancellationToken cancellationToken) =>
            Task.FromResult(Items.FirstOrDefault(item => item.Id == id));

        public Task AddAsync(WorkItem item, CancellationToken cancellationToken)
        {
            AddCalls++;
            Items.Add(item);
            return Task.CompletedTask;
        }

        public Task UpdateAsync(WorkItem item, CancellationToken cancellationToken)
        {
            UpdateCalls++;
            return Task.CompletedTask;
        }

        public Task DeleteAsync(WorkItem item, CancellationToken cancellationToken)
        {
            DeleteCalls++;
            Items.Remove(item);
            return Task.CompletedTask;
        }
    }
}
