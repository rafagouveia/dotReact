using System.Text.Json.Serialization;
using DotReact.Crud;
using DotReact.Hosting;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddProblemDetails();
builder.Services.AddWorkItemApplication();
builder.Services.AddWorkItemInfrastructure();
builder.Services.AddWorkItemAuthorization();
builder.AddDotReactApplication(options =>
{
    options.ConfigureRuntime = runtime =>
    {
        runtime.EnableStreaming = false;
        if (!builder.Environment.IsDevelopment()) return;
        runtime.RendererUrl = new Uri("http://127.0.0.1:5174");
        runtime.ClientScriptSrc = "http://127.0.0.1:5174/@id/virtual:dotreact/client-entry";
        runtime.ClientStyleSrc = "http://127.0.0.1:5174/src/styles.css";
        runtime.ReactRefreshPreambleSrc = "http://127.0.0.1:5174/@react-refresh";
    };
});

var app = builder.Build();
app.UseExceptionHandler();
app.UseDotReactApplication();
app.UseAuthentication();
app.UseAuthorization();
await DatabaseInitializer.InitializeAsync(app.Services);
app.MapGet("/health", () => Results.Ok(new { status = "healthy", database = "sqlite" }));
app.MapWorkItemRouteHandlers();
app.MapDotReactApplication();
app.Run();

public partial class Program;
