using Microsoft.AspNetCore.Mvc.RazorPages;

namespace RazorBaseline.Pages;

public sealed class BenchmarkModel(TimeProvider timeProvider) : PageModel
{
    public string Title { get; } = "Accounting reconciliation benchmark";
    public DateTimeOffset GeneratedAt { get; private set; }
    public static IReadOnlyList<Row> Rows { get; } = Enumerable.Range(1, 20)
        .Select(index => new Row(index, $"DOC-{index:0000}", index * 137.42m,
            index % 3 == 0 ? "Pending" : "Reconciled"))
        .ToArray();

    public void OnGet() => GeneratedAt = timeProvider.GetUtcNow();

    public sealed record Row(int Id, string Code, decimal Amount, string Status);
}
