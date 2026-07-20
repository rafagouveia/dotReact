using DotReact.Crud;
using Xunit;

namespace DotReact.Crud.Tests;

public sealed class ArchitectureTests
{
    [Fact]
    public void Domain_has_no_outward_framework_or_project_dependencies()
    {
        var references = typeof(WorkItem).Assembly.GetReferencedAssemblies().Select(reference => reference.Name).ToArray();

        Assert.DoesNotContain(references, name => name is not null &&
            (name.StartsWith("Microsoft.EntityFrameworkCore", StringComparison.Ordinal) ||
             name.StartsWith("Microsoft.AspNetCore", StringComparison.Ordinal) ||
             name.Contains("Application", StringComparison.Ordinal) ||
             name.Contains("Infrastructure", StringComparison.Ordinal)));
    }

    [Fact]
    public void Application_only_points_inward_to_domain()
    {
        var references = typeof(CreateWorkItemUseCase).Assembly.GetReferencedAssemblies()
            .Select(reference => reference.Name)
            .ToArray();

        Assert.DoesNotContain(references, name => name is not null &&
            (name.StartsWith("Microsoft.EntityFrameworkCore", StringComparison.Ordinal) ||
             name.StartsWith("Microsoft.AspNetCore", StringComparison.Ordinal) ||
             name.Contains("Infrastructure", StringComparison.Ordinal) ||
             name.Equals("Server", StringComparison.Ordinal)));
    }

    [Fact]
    public void Presentation_contracts_are_owned_by_server_not_application()
    {
        Assert.Equal(typeof(Program).Assembly, typeof(WorkItemDto).Assembly);
        Assert.NotEqual(typeof(CreateWorkItemUseCase).Assembly, typeof(WorkItemDto).Assembly);
    }

    [Fact]
    public void Application_uses_concrete_cohesive_helpers_not_artificial_interfaces()
    {
        var application = typeof(CreateWorkItemUseCase).Assembly;
        var removedInterfaces = new[]
        {
            "DotReact.Crud.IWorkItemMapper",
            "DotReact.Crud.IWorkItemInputValidator",
            "DotReact.Crud.IDashboardStatsCalculator"
        };

        Assert.All(removedInterfaces, name => Assert.Null(application.GetType(name)));
        Assert.All(
            new[] { typeof(WorkItemMapper), typeof(WorkItemInputValidator), typeof(DashboardStatsCalculator) },
            type => Assert.False(type.IsInterface));
    }
}
