using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace DotReact.Crud;

public static class DatabaseInitializer
{
    public static async Task InitializeAsync(IServiceProvider services, CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<WorkItemsDbContext>();
        var clock = scope.ServiceProvider.GetRequiredService<IClock>();
        await db.Database.EnsureCreatedAsync(cancellationToken);
        if (await db.WorkItems.AnyAsync(cancellationToken))
            return;

        var now = clock.UtcNow;
        db.WorkItems.AddRange(
            WorkItem.Create("Validar SSR com dados do SQLite",
                "Este card nasceu no seed C# e chegou ao React pelas props do servidor.",
                WorkItemStatus.InProgress, WorkItemPriority.High, now.AddDays(-2)),
            WorkItem.Create("Testar criação pelo formulário React",
                "Crie um item e confirme a persistência atualizando a página.",
                WorkItemStatus.Backlog, WorkItemPriority.Medium, now.AddDays(-1)),
            WorkItem.Create("Configurar Fast Refresh",
                "O estado do componente continua vivo enquanto o código React muda.",
                WorkItemStatus.Done, WorkItemPriority.Low, now.AddDays(-4)));

        await db.SaveChangesAsync(cancellationToken);
    }
}
