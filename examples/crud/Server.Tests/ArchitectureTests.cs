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
}
