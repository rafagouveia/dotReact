using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using DotReact.Crud;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace DotReact.Crud.Tests;

public sealed class WorkItemsApiTests : IClassFixture<CrudApplicationFactory>
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter() }
    };

    private readonly HttpClient _client;

    public WorkItemsApiTests(CrudApplicationFactory factory) => _client = factory.CreateClient();

    [Fact]
    public async Task Get_returns_seeded_items_with_string_enums()
    {
        using var response = await _client.GetAsync("/api/work-items");

        response.EnsureSuccessStatusCode();
        var body = await response.Content.ReadAsStringAsync();
        var items = JsonSerializer.Deserialize<List<WorkItemDto>>(body, JsonOptions);

        Assert.NotNull(items);
        Assert.True(items.Count >= 3);
        Assert.Contains(items, item => item.Title == "Validar SSR com dados do SQLite");
        Assert.Contains("\"status\":\"InProgress\"", body);
        Assert.Contains("\"priority\":\"High\"", body);
    }

    [Fact]
    public async Task Post_persists_a_work_item_and_returns_created()
    {
        var request = new CreateWorkItemRequest(
            "  Integrar C# e React  ",
            "  Persistido pelo endpoint .NET.  ",
            WorkItemStatus.Backlog,
            WorkItemPriority.High);

        using var response = await _client.PostAsJsonAsync("/api/work-items", request, JsonOptions);
        var created = await response.Content.ReadFromJsonAsync<WorkItemDto>(JsonOptions);

        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        Assert.NotNull(created);
        Assert.Equal("Integrar C# e React", created.Title);
        Assert.Equal("Persistido pelo endpoint .NET.", created.Description);
        Assert.NotNull(response.Headers.Location);
    }

    [Fact]
    public async Task Post_returns_validation_problem_for_invalid_input()
    {
        var request = new CreateWorkItemRequest(
            " ",
            new string('x', 1001),
            WorkItemStatus.Backlog,
            WorkItemPriority.Low);

        using var response = await _client.PostAsJsonAsync("/api/work-items", request, JsonOptions);
        var problem = await response.Content.ReadFromJsonAsync<ValidationProblemDetails>(JsonOptions);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.NotNull(problem);
        Assert.Contains("title", problem.Errors.Keys, StringComparer.OrdinalIgnoreCase);
        Assert.Contains("description", problem.Errors.Keys, StringComparer.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Put_updates_and_delete_removes_an_item()
    {
        var create = new CreateWorkItemRequest(
            "Item temporário",
            null,
            WorkItemStatus.Backlog,
            WorkItemPriority.Low);
        using var createResponse = await _client.PostAsJsonAsync("/api/work-items", create, JsonOptions);
        var created = await createResponse.Content.ReadFromJsonAsync<WorkItemDto>(JsonOptions);
        Assert.NotNull(created);

        var update = new UpdateWorkItemRequest(
            "Item concluído",
            "Atualizado pelo PUT.",
            WorkItemStatus.Done,
            WorkItemPriority.Medium);
        using var updateResponse = await _client.PutAsJsonAsync($"/api/work-items/{created.Id}", update, JsonOptions);
        var updated = await updateResponse.Content.ReadFromJsonAsync<WorkItemDto>(JsonOptions);

        updateResponse.EnsureSuccessStatusCode();
        Assert.NotNull(updated);
        Assert.Equal(WorkItemStatus.Done, updated.Status);

        using var deleteResponse = await _client.DeleteAsync($"/api/work-items/{created.Id}");
        using var secondDeleteResponse = await _client.DeleteAsync($"/api/work-items/{created.Id}");

        Assert.Equal(HttpStatusCode.NoContent, deleteResponse.StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, secondDeleteResponse.StatusCode);
    }

    [Fact]
    public async Task Put_returns_problem_details_when_item_does_not_exist()
    {
        var request = new UpdateWorkItemRequest(
            "Inexistente",
            null,
            WorkItemStatus.Done,
            WorkItemPriority.Low);

        using var response = await _client.PutAsJsonAsync("/api/work-items/999999", request, JsonOptions);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>(JsonOptions);

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("Work item não encontrado.", problem?.Title);
    }
}

public sealed class CrudApplicationFactory : WebApplicationFactory<Program>
{
    private readonly string _databasePath = Path.Combine(
        Path.GetTempPath(),
        $"dotreact-crud-tests-{Guid.NewGuid():N}.db");

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.ConfigureAppConfiguration((_, configuration) =>
        {
            configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["ConnectionStrings:WorkItems"] = $"Data Source={_databasePath}"
            });
        });
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing)
        {
            SqliteConnection.ClearAllPools();
            foreach (var path in new[] { _databasePath, $"{_databasePath}-shm", $"{_databasePath}-wal" })
            {
                if (File.Exists(path))
                {
                    File.Delete(path);
                }
            }
        }
    }
}
