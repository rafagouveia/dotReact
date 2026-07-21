using DotReact.AspNetCore;

namespace DotReact.Starter.Pages.Benchmark;

public sealed class BenchmarkPage(TimeProvider timeProvider) : IDotReactPage<BenchmarkPageProps>
{
    private static readonly IReadOnlyList<BenchmarkRow> Rows = Enumerable.Range(1, 20)
        .Select(index => new BenchmarkRow(
            index,
            $"DOC-{index:0000}",
            index * 137.42m,
            index % 3 == 0 ? "Pending" : "Reconciled"))
        .ToArray();

    public ValueTask<BenchmarkPageProps> LoadAsync(
        DotReactPageContext context,
        CancellationToken cancellationToken) =>
        ValueTask.FromResult(new BenchmarkPageProps(
            "Accounting reconciliation benchmark",
            timeProvider.GetUtcNow(),
            Rows));
}
