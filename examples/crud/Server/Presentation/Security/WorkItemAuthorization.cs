using Microsoft.AspNetCore.Authorization;

namespace DotReact.Crud;

public static class WorkItemAuthorization
{
    public const string PolicyName = "work-items.access";

    public static IServiceCollection AddWorkItemAuthorization(this IServiceCollection services)
    {
        services.AddAuthentication(DemoAuthenticationHandler.SchemeName)
            .AddScheme<DemoAuthenticationOptions, DemoAuthenticationHandler>(
                DemoAuthenticationHandler.SchemeName,
                _ => { });
        services.AddAuthorization(options =>
            options.AddPolicy(PolicyName, policy =>
                policy.RequireAuthenticatedUser()
                    .AddAuthenticationSchemes(DemoAuthenticationHandler.SchemeName)));
        return services;
    }
}
