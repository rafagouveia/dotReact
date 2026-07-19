using Microsoft.Extensions.DependencyInjection;

namespace DotReact.Crud;

public static class ApplicationServices
{
    public static IServiceCollection AddWorkItemApplication(this IServiceCollection services) => services
        .AddSingleton<IWorkItemInputValidator, WorkItemInputValidator>()
        .AddSingleton<IWorkItemMapper, WorkItemMapper>()
        .AddSingleton<IDashboardStatsCalculator, DashboardStatsCalculator>()
        .AddScoped<IListWorkItemsUseCase, ListWorkItemsUseCase>()
        .AddScoped<IGetDashboardUseCase, GetDashboardUseCase>()
        .AddScoped<ICreateWorkItemUseCase, CreateWorkItemUseCase>()
        .AddScoped<IUpdateWorkItemUseCase, UpdateWorkItemUseCase>()
        .AddScoped<IDeleteWorkItemUseCase, DeleteWorkItemUseCase>();
}
