namespace DotReact.Starter.Pages.Benchmark;

public sealed record BenchmarkRow(int Id, string Code, decimal Amount, string Status);

public sealed record BenchmarkPageProps(
    string Title,
    DateTimeOffset GeneratedAt,
    IReadOnlyList<BenchmarkRow> Rows);
