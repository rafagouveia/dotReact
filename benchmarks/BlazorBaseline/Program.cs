using BlazorBaseline.Components;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddRazorComponents();
builder.Services.AddSingleton(TimeProvider.System);
var app = builder.Build();
app.UseAntiforgery();
app.MapGet("/_health/live", () => Results.Ok());
app.MapRazorComponents<App>();
app.Run();
