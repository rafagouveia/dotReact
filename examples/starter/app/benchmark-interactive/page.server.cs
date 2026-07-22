using DotReact.AspNetCore;

namespace DotReact.Starter.Pages.BenchmarkInteractive;

public sealed class BenchmarkInteractivePage(TimeProvider timeProvider) : IDotReactPage<BenchmarkInteractivePageProps>
{
    private static readonly IReadOnlyList<BenchmarkInteractiveRow> Rows = Enumerable.Range(1, 20)
        .Select(index => new BenchmarkInteractiveRow(
            index,
            $"DOC-{index:0000}",
            index * 137.42m,
            index % 3 == 0 ? "Pending" : "Reconciled"))
        .ToArray();

    public ValueTask<BenchmarkInteractivePageProps> LoadAsync(
        DotReactPageContext context,
        CancellationToken cancellationToken) =>
        ValueTask.FromResult(new BenchmarkInteractivePageProps(
            "Accounting reconciliation benchmark",
            timeProvider.GetUtcNow(),
            Rows));
}

public sealed record BenchmarkInteractivePageProps(
    string Title,
    DateTimeOffset GeneratedAt,
    IReadOnlyList<BenchmarkInteractiveRow> Rows);

public sealed record BenchmarkInteractiveRow(int Id, string Code, decimal Amount, string Status);
