using Microsoft.EntityFrameworkCore;

namespace DotReact.Crud;

public static class InfrastructureServices
{
    public static IServiceCollection AddWorkItemInfrastructure(this IServiceCollection services)
    {
        services.AddDbContext<WorkItemsDbContext>((provider, options) =>
        {
            var configuration = provider.GetRequiredService<IConfiguration>();
            var environment = provider.GetRequiredService<IHostEnvironment>();
            var connectionString = configuration.GetConnectionString("WorkItems");
            if (string.IsNullOrWhiteSpace(connectionString))
            {
                var databasePath = Path.Combine(environment.ContentRootPath, "App_Data", "work-items.db");
                Directory.CreateDirectory(Path.GetDirectoryName(databasePath)!);
                connectionString = $"Data Source={databasePath}";
            }

            options.UseSqlite(connectionString);
        });
        services.AddScoped<EfWorkItemRepository>();
        services.AddScoped<IWorkItemReadRepository>(provider => provider.GetRequiredService<EfWorkItemRepository>());
        services.AddScoped<IWorkItemWriteRepository>(provider => provider.GetRequiredService<EfWorkItemRepository>());
        services.AddSingleton(TimeProvider.System);
        services.AddSingleton<IClock, SystemClock>();
        return services;
    }
}
