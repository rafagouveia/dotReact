using System.Text.Json.Serialization;
using DotReact.AspNetCore;
using DotReact.Crud;

var builder = WebApplication.CreateBuilder(args);

builder.Services.ConfigureHttpJsonOptions(options =>
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddProblemDetails();
builder.Services.AddWorkItemApplication();
builder.Services.AddWorkItemInfrastructure();
builder.Services.AddDotReactSecurityHeaders();
builder.Services.AddDotReact(options =>
{
    options.RendererUrl = new Uri("http://127.0.0.1:5174");
    options.RendererToken = Environment.GetEnvironmentVariable("DOTREACT_RENDERER_TOKEN");
    options.ClientScriptSrc = "http://127.0.0.1:5174/src/entry-client.tsx";
    options.ReactRefreshPreambleSrc = "http://127.0.0.1:5174/@react-refresh";
    options.Development = builder.Environment.IsDevelopment();
});

var app = builder.Build();
app.UseExceptionHandler();
app.UseDotReactSecurityHeaders();
await DatabaseInitializer.InitializeAsync(app.Services);
app.MapWorkItemEndpoints();
app.Run();

public partial class Program;
